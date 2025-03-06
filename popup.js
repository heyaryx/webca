function updateUI() {
  chrome.storage.local.get(
    ["timeSpentWebsites", "activeWebsite", "lastUpdateTime"],
    (data) => {
      let ts = data.timeSpentWebsites || {};
      let liveTS = { ...ts };
      // If there is an active website, add live elapsed time to its stored value.
      if (data.activeWebsite && data.lastUpdateTime) {
        const extra = (Date.now() - data.lastUpdateTime) / 1000; // extra seconds since last update
        liveTS[data.activeWebsite] = (liveTS[data.activeWebsite] || 0) + extra;
      }
      let displayText = "";
      let totalSeconds = 0;
      for (let website in liveTS) {
        let minutes = (liveTS[website] / 60).toFixed(2);
        displayText += `${website}: ${minutes} min\n`;
        totalSeconds += liveTS[website];
      }
      let totalMinutes = (totalSeconds / 60).toFixed(2);
      displayText += `\nTotal: ${totalMinutes} min`;
      
      // Calculate live CO₂ estimate:
      // Convert totalSeconds to hours and multiply by emission rate (0.008 kg CO₂ per hour).
      let liveFootprint = ((totalSeconds / 3600) * 0.008).toFixed(8);
      
      document.getElementById("timeSpent").textContent = displayText;
      document.getElementById("co2Estimate").textContent = liveFootprint + " kg";
    }
  );
}

// Update UI every 3 seconds.
setInterval(updateUI, 3000);
document.addEventListener("DOMContentLoaded", updateUI);
