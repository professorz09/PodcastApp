const fs = require('fs');

let content = fs.readFileSync('flask_server.py', 'utf8');

const mergeIntroCode = `
@app.route('/api/video/merge-intro', methods=['POST'])
def merge_intro():
    try:
        import time as _time
        import subprocess
        
        if 'rendered_video' not in request.files:
            return jsonify({'error': 'rendered_video file is required'}), 400
            
        rendered_file = request.files['rendered_video']
        rendered_filename = f'rendered_upload_{int(_time.time() * 1000)}.mp4'
        rendered_path = os.path.join(DOWNLOAD_DIR, rendered_filename)
        rendered_file.save(rendered_path)
        
        intro_path = os.path.join(os.path.dirname(__file__), "public", "intro.mp4")
        if 'custom_intro' in request.files:
            custom_intro_file = request.files['custom_intro']
            if custom_intro_file.filename != '':
                intro_path = os.path.join(DOWNLOAD_DIR, f'custom_intro_{int(_time.time() * 1000)}.mp4')
                custom_intro_file.save(intro_path)
                
        if not os.path.exists(intro_path):
            # No intro available, return the rendered video
            return send_file(rendered_path, as_attachment=True, download_name='rendered_video.mp4')
            
        resolution = request.form.get('resolution', '720p')
        target_w = 1920 if resolution == '1080p' else 1280
        target_h = 1080 if resolution == '1080p' else 720
        
        output_name = f'merged_{int(_time.time() * 1000)}.mp4'
        output_path = os.path.join(DOWNLOAD_DIR, output_name)
        
        filter_complex = f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];[1:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]"
        
        ffmpeg_cmd = [
            'ffmpeg', '-y',
            '-i', intro_path,
            '-i', rendered_path,
            '-filter_complex', filter_complex,
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '22',
            '-c:a', 'aac',
            output_path
        ]
        
        subprocess.run(ffmpeg_cmd, check=True)
        
        return send_file(output_path, as_attachment=True, download_name=output_name)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
`;

if (!content.includes('/api/video/merge-intro')) {
    content = content.replace("@app.route('/api/video/edit', methods=['POST'])", mergeIntroCode + "\n@app.route('/api/video/edit', methods=['POST'])");
    fs.writeFileSync('flask_server.py', content);
    console.log("Patched flask_server.py");
}
