const fs = require('fs');
const path = require('path');

const FLASK_URL = 'https://autovid-flask.onrender.com';

const dirs = ['./components'];
for (const dir of dirs) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        let modified = false;
        
        // Regex to find fetch('/api/...') but NOT /api/gemini or /api/google or /api/elevenlabs
        const fetchRegex = /fetch\(\s*['"`]\/api\/(youtube|instagram|reddit|video|shorts|health|cookies|files)([^'"`]*)['"`]/g;
        
        content = content.replace(fetchRegex, (match, endpoint, rest) => {
            modified = true;
            return `fetch('${FLASK_URL}/api/${endpoint}${rest}'`;
        });
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Patched ${filePath}`);
        }
    }
}
