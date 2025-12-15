const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// Define version information
const version = [2, 3000, 1015901307];

router.get('/', async (req, res) => {
    let num = req.query.number;

    async function PairCode() {
        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(`./session`);

        try {
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            sock.ev.on('creds.update', saveCreds);

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);

                if (!res.headersSent) {
                    await res.send({ code, version });
                }
            }

            sock.ev.on("connection.update", async (s) => {
                const {
                    connection,
                    lastDisconnect
                } = s;

                if (connection == "open") {
                    await delay(5000); // Reduced delay
                    
                    // Read and send creds.json
                    const sessionsock = fs.readFileSync('./session/creds.json');
                    const sockses = await sock.sendMessage(sock.user.id, {
                        document: sessionsock,
                        mimetype: `application/json`,
                        fileName: `creds.json`
                    });

                    // Send instructions
                    await sock.sendMessage(sock.user.id, {
                        text: `🚀 *CREDS.JSON EXPORTED SUCCESSFULLY* 🚀

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
✅ *STEP COMPLETED:* Credentials Export
📁 *FILE SENT:* creds.json
⏰ *TIME:* ${new Date().toLocaleString()}

📥 *NEXT STEPS:*
1. Save creds.json file securely
2. Use it in your bot's session folder
3. Start your bot separately

⚠️ *IMPORTANT:*
• This connection will close automatically
• Use creds.json in a NEW bot instance
• Keep credentials PRIVATE and SECURE

🔧 *TECH SUPPORT:*
⌬ Developer: Fredi Ezra
☎ Contact: _https://wa.me/255752593977_
⎔ Repo: _https://github.com/FezChat/Fee-Xmd_

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
💡 *FREDI AI PROTOCOL*
» Emerging tech collective
» Mission: "Empower through code"

🔗 *JOIN DEVELOPMENT NETWORK:*
_https://whatsapp.com/channel/0029VaihcQv84Om8LP59fO3f_

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
*[System ID: FEE-XMD-v${version.join('.')}]*`
                    }, { quoted: sockses });

                    // Wait a bit and close connection gracefully
                    await delay(3000);
                    console.log('Credentials exported. Closing connection...');
                    
                    // Option 1: Keep session for reuse (comment out removeFile)
                    // Option 2: Clean up session (uncomment below)
                    // await removeFile('./session');
                    
                    // Close WebSocket connection
                    if (sock.ws && sock.ws.readyState === 1) {
                        sock.ws.close();
                    }
                    
                    return;
                }

                if (connection === "close") {
                    console.log('Connection closed.');
                    // No reconnection for exporter version
                }
            });
        } catch (err) {
            console.log("Service error:", err);
            await removeFile('./session');
            if (!res.headersSent) {
                await res.send({ code: "Service Unavailable", version });
            }
        }
    }

    return await PairCode();
});

process.on('uncaughtException', function (err) {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    console.log('Caught exception: ', err);
});

module.exports = router;