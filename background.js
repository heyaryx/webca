// background.js

const generalEmissionRate = 0.008; // kg CO₂ per hour

// Global variables for tracking the active website and its last update time.
let activeWebsite = null;
let lastUpdateTime = Date.now();

// Utility function: Returns today’s date string in YYYY-MM-DD format.
function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

// Initialize storage defaults.
chrome.storage.local.get(
  { 
    timeSpentWebsites: {}, 
    todayTimeSpentWebsites: {}, 
    footprint: 0, 
    todayFootprint: 0, 
    activeWebsite: null, 
    lastUpdateTime: Date.now(), 
    todayDate: getTodayDateString() 
  },
  () => {
    // Defaults set.
  }
);

// Check if today’s date has changed; if so, reset today’s data.
function checkTodayReset() {
  chrome.storage.local.get(["todayDate"], (result) => {
    let storedDate = result.todayDate;
    let today = getTodayDateString();
    if (storedDate !== today) {
      chrome.storage.local.set({ todayTimeSpentWebsites: {}, todayDate: today });
    }
  });
}

/**
 * updateActiveTab(url)
 * - Updates tracked time for the current active website (both total and today's).
 * - Then sets the new active website based on the URL.
 */
function updateActiveTab(url) {
  const now = Date.now();
  // Update time for the current active website.
  if (activeWebsite) {
    const elapsedSeconds = (now - lastUpdateTime) / 1000;
    // Update total usage.
    chrome.storage.local.get(["timeSpentWebsites"], (result) => {
      let ts = result.timeSpentWebsites || {};
      ts[activeWebsite] = (ts[activeWebsite] || 0) + elapsedSeconds;
      chrome.storage.local.set({ timeSpentWebsites: ts });
    });
    // Update today's usage.
    checkTodayReset();
    chrome.storage.local.get(["todayTimeSpentWebsites"], (result) => {
      let tts = result.todayTimeSpentWebsites || {};
      tts[activeWebsite] = (tts[activeWebsite] || 0) + elapsedSeconds;
      chrome.storage.local.set({ todayTimeSpentWebsites: tts });
    });
  }
  // Set the new active website.
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    activeWebsite = hostname;
  } catch (e) {
    activeWebsite = "unknown";
  }
  lastUpdateTime = now;
  // Save for the popup.
  chrome.storage.local.set({ activeWebsite: activeWebsite, lastUpdateTime: lastUpdateTime });
}

/**
 * periodicTrack()
 * - Called periodically as a fallback to update tracking.
 */
function periodicTrack() {
  const now = Date.now();
  if (activeWebsite) {
    const elapsedSeconds = (now - lastUpdateTime) / 1000;
    chrome.storage.local.get(["timeSpentWebsites"], (result) => {
      let ts = result.timeSpentWebsites || {};
      ts[activeWebsite] = (ts[activeWebsite] || 0) + elapsedSeconds;
      chrome.storage.local.set({ timeSpentWebsites: ts });
    });
    checkTodayReset();
    chrome.storage.local.get(["todayTimeSpentWebsites"], (result) => {
      let tts = result.todayTimeSpentWebsites || {};
      tts[activeWebsite] = (tts[activeWebsite] || 0) + elapsedSeconds;
      chrome.storage.local.set({ todayTimeSpentWebsites: tts });
    });
    lastUpdateTime = now;
    chrome.storage.local.set({ lastUpdateTime: lastUpdateTime });
  }
}

// Listen for tab activation (when the user switches tabs).
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      updateActiveTab(tab.url);
    }
  });
});

// Listen for URL updates in the active tab.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    updateActiveTab(changeInfo.url);
  }
});

// Set an alarm to update tracking every minute (as a fallback).
chrome.alarms.create("periodicTrack", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "periodicTrack") {
    periodicTrack();
  } else if (alarm.name === "calculateFootprint") {
    estimateFootprint();
  }
});

// Use idle detection to pause tracking when the user is inactive.
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === "idle" || newState === "locked") {
    const now = Date.now();
    if (activeWebsite) {
      const elapsed = (now - lastUpdateTime) / 1000;
      chrome.storage.local.get(["timeSpentWebsites"], (result) => {
        let ts = result.timeSpentWebsites || {};
        ts[activeWebsite] = (ts[activeWebsite] || 0) + elapsed;
        chrome.storage.local.set({ timeSpentWebsites: ts });
      });
      checkTodayReset();
      chrome.storage.local.get(["todayTimeSpentWebsites"], (result) => {
        let tts = result.todayTimeSpentWebsites || {};
        tts[activeWebsite] = (tts[activeWebsite] || 0) + elapsed;
        chrome.storage.local.set({ todayTimeSpentWebsites: tts });
      });
    }
    activeWebsite = null;
    chrome.storage.local.set({ activeWebsite: null });
  } else if (newState === "active") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        updateActiveTab(tabs[0].url);
      }
    });
  }
});

/**
 * estimateFootprint()
 * - Calculates both total and today's carbon footprint.
 */
function estimateFootprint() {
  // Total footprint.
  chrome.storage.local.get(["timeSpentWebsites"], (result) => {
    const ts = result.timeSpentWebsites || {};
    let totalSeconds = 0;
    for (let website in ts) {
      totalSeconds += ts[website];
    }
    const hours = totalSeconds / 3600;
    const totalFootprint = hours * generalEmissionRate;
    chrome.storage.local.set({ footprint: totalFootprint });
  });
  // Today's footprint.
  chrome.storage.local.get(["todayTimeSpentWebsites"], (result) => {
    const tts = result.todayTimeSpentWebsites || {};
    let todaySeconds = 0;
    for (let website in tts) {
      todaySeconds += tts[website];
    }
    const hoursToday = todaySeconds / 3600;
    const todayFootprint = hoursToday * generalEmissionRate;
    chrome.storage.local.set({ todayFootprint: todayFootprint });
  });
}

// Calculate the carbon footprint every 10 minutes.
chrome.alarms.create("calculateFootprint", { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "calculateFootprint") {
    estimateFootprint();
  }
});
