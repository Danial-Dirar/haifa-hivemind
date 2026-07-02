// Shown as the first-run agreement inside the app (covers Linux/AppImage, where
// there is no installer wizard). Mirrors desktop/build/eula.txt used by the
// Windows installer.
export const EULA_TEXT = `HAIFA HIVEMIND — END USER LICENSE AGREEMENT
A product of Haifa Intelligence · Last updated 2 July 2026

By installing or using Haifa HiveMind ("the Software") you agree to these terms.
If you do not agree, do not use the Software.

1. LICENSE
Haifa Intelligence grants you a personal, non-exclusive, non-transferable
license to use the Software on hardware you own or control, for your own
research and productivity purposes.

2. ACCEPTABLE & ETHICAL USE
You agree to use the Software lawfully and ethically. You will NOT use it to:
break any law; create or facilitate harm, harassment, fraud, deception, or
misinformation; produce unlawful content or content that infringes others'
rights; or reverse-engineer, resell, or redistribute the Software as your own.
You are solely responsible for the documents you provide and how you use the
output.

3. LOCAL & PRIVATE OPERATION
The Software runs entirely on your own device and does not send your documents,
chats, or data to Haifa Intelligence or any third party. You are responsible for
the security and backup of data on your machine.

4. SYSTEM REQUIREMENTS & PERFORMANCE
You acknowledge the Software runs local AI models and is resource-intensive, and
you confirm your hardware is suitable — a dedicated NVIDIA GPU (8 GB VRAM
minimum, 16 GB recommended) is expected. Speed and quality depend on your
hardware and on third-party components (e.g. Ollama and the AI models) being
installed. Haifa Intelligence is not responsible for performance on unsupported
hardware.

5. THIRD-PARTY COMPONENTS
The Software relies on third-party open-source components (including Ollama and
the Qwen model family), each under its own license.

6. CHANGES TO THIS AGREEMENT
Haifa Intelligence may update these terms, features, models, or requirements in
future releases. Continued use after changes take effect constitutes acceptance.

7. NO WARRANTY & LIMITATION OF LIABILITY
The Software is provided "AS IS", without warranty of any kind. AI output may be
inaccurate and must not be relied upon as professional advice without
verification. To the maximum extent permitted by law, Haifa Intelligence is not
liable for any damages arising from use of the Software.

By selecting "I Agree", you confirm you have read, understood, and accepted this
Agreement.

© 2026 Haifa Intelligence. All rights reserved.`;

export const EULA_VERSION = "hivemind_eula_v1"; // localStorage key
