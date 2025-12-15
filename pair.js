const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    getAggregateVotesInPollMessage,
    proto
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// Define version information
const version = [2, 3000, 1015901307];

router.get('/', async (req, res) => {
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).send({ error: "Phone number is required" });
    }

    async function PairCode() {
        const sessionDir = `./session_${Date.now()}`; // Unique session directory
        
        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(sessionDir);

        try {
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
                version: version
            });

            sock.ev.on('creds.update', saveCreds);

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await sock.requestPairingCode(num);
                    console.log(`Pairing code generated for ${num}`);
                    
                    if (!res.headersSent) {
                        res.send({ code, version, status: "pairing_code_generated" });
                    }
                } catch (pairingError) {
                    console.error("Pairing error:", pairingError);
                    if (!res.headersSent) {
                        res.status(500).send({ error: "Failed to generate pairing code" });
                    }
                    return;
                }
            }

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;
                console.log("Connection update:", connection);

                if (connection === "open") {
                    console.log("Connected successfully!");
                    await delay(2000); // Give time for full connection
                    
                    try {
                        // Get the user's ID (your own number)
                        const userId = sock.user.id;
                        console.log("User ID:", userId);
                        
                        // Read the creds.json file
                        const credsPath = path.join(sessionDir, 'creds.json');
                        
                        if (!fs.existsSync(credsPath)) {
                            console.error("creds.json not found at:", credsPath);
                            return;
                        }
                        
                        const sessionsock = fs.readFileSync(credsPath);
                        const credsData = JSON.parse(sessionsock.toString());
                        
                        console.log("Creds loaded, sending message...");
                        
                        // First send the creds.json as document
                        await sock.sendMessage(userId, {
                            text: "📁 *SENDING SESSION CREDENTIALS*\n\nPlease wait while I send your creds.json file..."
                        });
                        
                        await delay(1000);
                        
                        const sentMsg = await sock.sendMessage(userId, {
                            document: sessionsock,
                            mimetype: 'application/json',
                            fileName: `creds_${Date.now()}.json`
                        });
                        
                        console.log("Creds file sent");
                        
                        // Send detailed instructions
                        const sessionId = credsData.noiseKey && credsData.noiseKey.public ? 
                            Buffer.from(credsData.noiseKey.public).toString('hex').substring(0, 16) : 
                            'SESSION_' + Date.now();
                        
                        await sock.sendMessage(userId, {
                            text: `🚀 *SESSION EXPORT COMPLETE* 🚀

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
✅ *SESSION ID:* ${sessionId}
📁 *FILE:* creds.json sent as document
📊 *DEVICE:* ${credsData.me?.platform || 'Unknown'}
⏰ *TIME:* ${new Date().toLocaleString()}

📥 *HOW TO USE:*
1. Save the attached creds.json file
2. Place it in your bot's session folder
3. Restart your bot with the new session

⚠️ *SECURITY NOTES:*
• Keep this file PRIVATE
• Never share with anyone
• Delete after successful bot setup

🔧 *TECHNICAL DETAILS:*
• Platform: Baileys ${version.join('.')}
• Auth Method: Multi-file
• Status: Exported successfully

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
*[System ID: FEE-XMD-v${version.join('.')}]*`
                        });
                        
                        console.log("Instructions sent");
                        
                        // Wait and close
                        await delay(5000);
                        console.log("Closing connection...");
                        
                        // Close connection
                        if (sock.ws && sock.ws.readyState === 1) {
                            sock.end();
                        }
                        
                        // Optional: Clean up session folder after sending
                        // removeFile(sessionDir);
                        
                    } catch (sendError) {
                        console.error("Error sending message:", sendError);
                    }
                    
                    return;
                }

                if (connection === "close") {
                    console.log('Connection closed:', lastDisconnect?.error?.message || 'Unknown reason');
                    // Clean up on close
                    // removeFile(sessionDir);
                }
            });
            
            // Handle errors
            sock.ev.on("creds.update", saveCreds);
            
        } catch (err) {
            console.error("Service error:", err);
            // Clean up on error
            if (sessionDir && fs.existsSync(sessionDir)) {
                removeFile(sessionDir);
            }
            if (!res.headersSent) {
                res.status(500).send({ error: "Service error", details: err.message });
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