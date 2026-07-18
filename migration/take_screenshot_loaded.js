import puppeteer from 'puppeteer-core';

async function run() {
  console.log('Launching Linux Chrome inside WSL...');
  const browser = await puppeteer.launch({
    executablePath: '/home/catnolan/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--headless=new'
    ]
  });
  
  const page = await browser.newPage();
  
  // Set desktop viewport
  await page.setViewport({
    width: 1280,
    height: 1000
  });

  // Listen for browser console events
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER EXCEPTION] ${err.toString()}`);
  });
  
  console.log('Navigating to http://localhost:5175/...');
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle2', timeout: 30000 });
  
  console.log('Waiting 3 seconds for load...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('Taking screenshot...');
  const savePath = '/mnt/c/Users/catnolan_senoiahisto/.gemini/antigravity/brain/587a9c45-052e-4f1b-86b8-98da6347a4b2/screenshot.png';
  await page.screenshot({ path: savePath, fullPage: true });
  
  await browser.close();
  console.log('Screenshot saved successfully to:', savePath);
}

run().catch(err => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
