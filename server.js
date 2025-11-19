import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PORT = 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.csv': 'text/csv'
};

const server = http.createServer(async (req, res) => {
  // API endpoint for listing metrics files
  if (req.url === '/api/metrics-files' && req.method === 'GET') {
    try {
      const dataDir = './data';
      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
        .sort();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
  // API endpoint for running metrics
  if (req.url === '/api/run-metrics' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const config = JSON.parse(body);
        
        // Update .env file if config provided
        if (config.startDate || config.endDate || config.maxIssues) {
          const envPath = '.env';
          let envContent = fs.readFileSync(envPath, 'utf8');
          
          if (config.startDate) {
            envContent = envContent.replace(/JIRA_START_DATE=.*/, `JIRA_START_DATE=${config.startDate}`);
          }
          if (config.endDate) {
            envContent = envContent.replace(/JIRA_END_DATE=.*/, `JIRA_END_DATE=${config.endDate}`);
          }
          if (config.maxIssues) {
            envContent = envContent.replace(/JIRA_MAX_ISSUES=.*/, `JIRA_MAX_ISSUES=${config.maxIssues}`);
          }
          
          fs.writeFileSync(envPath, envContent);
        }
        
        // Run the metrics collection
        console.log('Running metrics collection...');
        const { stdout, stderr } = await execAsync('node src/index.js');
        console.log(stdout);
        if (stderr) console.error(stderr);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Metrics collected successfully' }));
      } catch (error) {
        console.error('Error running metrics:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // Serve static files
  let filePath = '.' + req.url;
  if (filePath === './') filePath = './dashboard/index.html';
  
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dashboard server running at http://localhost:${PORT}`);
  console.log(`📊 Open your browser to view the dashboard\n`);
});
