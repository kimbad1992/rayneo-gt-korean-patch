# Third-party rights and provenance

Reviewed 2026-10-18.

RayNeo, GT and GT Max identify the compatible vendor products. This project is not affiliated with or endorsed by RayNeo. No vendor logo is included.

The MIT license applies to this project's original code and original contributions only. It does not license RayNeo firmware, original menu artwork, third-party technology in that firmware, trademarks, or Windows font software. Users must obtain the exact original firmware separately from the vendor. Neither original nor fully modified firmware is hosted here.

The two `.rnp` files are compressed COPY/ADD deltas against SHA-256-pinned original DFUs. COPY commands reference bytes in the user's original file; ADD commands contain changed localization and patch data. The resulting localized images preserve original UI design on the user's device. Patch distribution is not a blanket legal exemption, and this project makes no claim of vendor permission or jurisdiction-independent non-infringement.

Earlier private installer versions contained vendor web updater modules. Those files are not included in this repository or release. `web/transport.js` and `web/binary.js` are newly written implementations using WebUSB, standard ZIP structures and documented DFU requests. No vendor script is downloaded or executed by this installer. Protocol observations were used during development; this is not a claim of a formal clean-room process.

The Korean menu modifications use rendered words and phrases originally produced with Windows Malgun Gothic. Font files and per-character reusable bitmap fonts are not included. Microsoft's font FAQ distinguishes distributing rendered word/phrase graphic files from redistributing or converting font software. This notice does not grant additional font rights.

References:

- [RayNeo official updater](https://ota.rayneo.com/)
- [RayNeo website Terms of Service](https://www.rayneo.com/policies/terms-of-service): no firmware redistribution permission was verified; the website terms are not presented as a model-specific firmware license.
- [Microsoft font redistribution FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq), especially the rendered word/phrase graphics and bitmap-font distinction.
- [USB Device Firmware Upgrade 1.1](https://www.usb.org/sites/default/files/DFU_1.1.pdf): referenced, not bundled.

The original firmware's rights remain with its respective owners. If a rights holder identifies a specific concern, please open an issue with the affected file and basis for the request; do not attach proprietary firmware or credentials.
