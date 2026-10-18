"""Create a COPY/ADD delta. Inputs stay local; output requires the exact base.

Usage: python tools/make_patch.py ORIGINAL.dfu MODIFIED.dfu OUTPUT.rnp
The format is zlib(RNP1 + uint32 output_size + commands).
COPY: byte 0, uint32 source_offset, uint32 length.
ADD: byte 1, uint32 length, literal bytes. All integers are little endian.
"""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import struct
import zlib


def sha(data):
    return hashlib.sha256(data).hexdigest()


def create_delta(source, target):
    index = {}
    for pos in range(0, len(source)-7, 2):
        key = source[pos:pos+8]
        candidates = index.setdefault(key, array('I'))
        if len(candidates) < 8:
            candidates.append(pos)
    encoded = bytearray(b'RNP1'+struct.pack('<I', len(target)))
    literals = bytearray()
    copied = added = commands = 0

    def flush():
        nonlocal added, commands
        if literals:
            encoded.extend(b'\x01'+struct.pack('<I', len(literals))+literals)
            added += len(literals)
            commands += 1
            literals.clear()

    pos = 0
    while pos < len(target):
        best_offset = best_length = 0
        candidates = list(index.get(target[pos:pos+8], ()))
        # Preserve arbitrarily long unchanged ranges without index sampling loss.
        if pos+8 <= len(source) and source[pos:pos+8] == target[pos:pos+8]:
            candidates.insert(0, pos)
        for offset in candidates:
            limit = min(len(source)-offset, len(target)-pos)
            length = 8
            while length+1024 <= limit and source[offset+length:offset+length+1024] == target[pos+length:pos+length+1024]:
                length += 1024
            while length < limit and source[offset+length] == target[pos+length]:
                length += 1
            if length > best_length:
                best_offset, best_length = offset, length
            if length > 65536:
                break
        if best_length >= 8:
            flush()
            encoded.extend(b'\x00'+struct.pack('<II', best_offset, best_length))
            copied += best_length
            commands += 1
            pos += best_length
        else:
            literals.append(target[pos])
            pos += 1
    flush()
    return zlib.compress(encoded, 9), dict(copied_bytes=copied, literal_bytes=added, commands=commands)


def apply_delta(source, compressed):
    raw = zlib.decompress(compressed)
    if raw[:4] != b'RNP1':
        raise ValueError('Invalid delta')
    size = struct.unpack_from('<I', raw, 4)[0]
    output = bytearray()
    pos = 8
    while pos < len(raw):
        op = raw[pos]
        pos += 1
        if op == 0:
            offset, length = struct.unpack_from('<II', raw, pos)
            pos += 8
            if not length or offset+length > len(source):
                raise ValueError('COPY out of bounds')
            output.extend(source[offset:offset+length])
        elif op == 1:
            length = struct.unpack_from('<I', raw, pos)[0]
            pos += 4
            if not length or pos+length > len(raw):
                raise ValueError('ADD out of bounds')
            output.extend(raw[pos:pos+length])
            pos += length
        else:
            raise ValueError('Unknown delta command')
        if len(output) > size:
            raise ValueError('Output overflow')
    if len(output) != size:
        raise ValueError('Output truncated')
    return bytes(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    source, target = args.source.read_bytes(), args.target.read_bytes()
    delta, stats = create_delta(source, target)
    assert apply_delta(source, delta) == target
    args.output.write_bytes(delta)
    print(json.dumps(dict(source_sha256=sha(source), target_sha256=sha(target),
                          patch_sha256=sha(delta), source_bytes=len(source),
                          target_bytes=len(target), patch_bytes=len(delta), **stats)))
