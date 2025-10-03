@echo off
REM Create a daily scheduled task to scrape reviews

schtasks /create /tn "Pheromone Review Scraper" /tr "cmd /c cd /d C:\Users\HomePC\Desktop\pheromoneparfums && npm run scrape && git push" /sc daily /st 03:00 /f

echo.
echo ✅ Daily scraper scheduled!
echo It will run every day at 3:00 AM
echo.
echo To test it now, run: npm run scrape
echo.
pause
