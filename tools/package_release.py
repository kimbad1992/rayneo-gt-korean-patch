"""Package an explicit allowlist; never include firmware inputs or generated DFUs."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT=Path(__file__).resolve().parent.parent
RUNTIME=['Start.cmd','server.py','README.md','NOTICE.md','LICENSE',
 'web/index.html','web/style.css','web/app.js','web/core.js','web/transport.js',
 'web/binary.js','web/dfu-descriptor.js','web/package-data.js','web/package.json',
 'web/patches/firmware.rnp','web/patches/osd_images.rnp']
SOURCE=RUNTIME+['.gitignore','RELEASE_NOTES.md','tools/make_patch.py','tools/package_release.py',
 'tests/core.test.mjs','tests/browser.test.cjs','tests/dfu-descriptor.test.mjs',
 'tests/session_usb.cjs','tests/stub_usb.cjs','tests/core-result.json','tests/browser_result.json']

def sha(data):return hashlib.sha256(data).hexdigest()

def validate():
    for name in SOURCE:
        path=ROOT/name
        assert path.is_file() and not path.is_symlink(), name
        if path.suffix not in ('.rnp',):
            text=path.read_text(encoding='utf-8')
            assert ('C:/'+'Users/') not in text and ('C:\\'+'Users\\') not in text, name
            assert ('__webpack_'+'require__') not in text, name
        assert path.suffix not in ('.dfu','.zip','.ttf','.otf','.apk','.pem','.key'), name
    launcher=(ROOT/'Start.cmd').read_bytes()
    assert launcher.isascii() and b'\n' not in launcher.replace(b'\r\n',b'')
    for name in ('tests/core-result.json','tests/browser_result.json'):
        report=json.loads((ROOT/name).read_text(encoding='utf-8'))
        assert report['pass'] and not report['hardwareAccess']
        for file,digest in report['testedFiles'].items():
            assert sha((ROOT/'web'/file).read_bytes())==digest, 'Stale tests: '+file

if __name__=='__main__':
    validate()
    out=ROOT/'dist';out.mkdir(exist_ok=True)
    target=out/'RayNeo_GT_Korean_Patch_v2.0.0-beta.1.zip'
    manifest={name:sha((ROOT/name).read_bytes()) for name in RUNTIME}
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name in RUNTIME:
            item=zipfile.ZipInfo('RayNeo_GT_Korean_Patch/'+name,date_time=(2026,10,18,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(item,(ROOT/name).read_bytes(),compresslevel=9)
        item=zipfile.ZipInfo('RayNeo_GT_Korean_Patch/SHA256SUMS.json',date_time=(2026,10,18,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(item,json.dumps(manifest,indent=2)+'\n',compresslevel=9)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(RUNTIME)+1
        for name,digest in manifest.items():assert sha(archive.read('RayNeo_GT_Korean_Patch/'+name))==digest
    checksum=sha(target.read_bytes())
    (out/'SHA256SUMS.txt').write_text(checksum+'  '+target.name+'\n',encoding='ascii')
    print(json.dumps({'zip':str(target),'bytes':target.stat().st_size,'sha256':checksum,'source_files':len(SOURCE),'runtime_files':len(RUNTIME)}))
