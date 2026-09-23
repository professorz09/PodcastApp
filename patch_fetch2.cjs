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
        
        // This will find fetch('/api/...') and replace with fetch('https://autovid-flask.onrender.com/api/...')
        content = content.replace(/fetch\(\s*['"`]\/api\/(youtube|instagram|reddit|video|shorts|health|cookies|files)(.*?)['"`]/g, (match, endpoint, rest) => {
            modified = true;
            return `fetch('${FLASK_URL}/api/${endpoint}${rest}'`;
        });
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Patched ${filePath}`);
        }
    }
}
