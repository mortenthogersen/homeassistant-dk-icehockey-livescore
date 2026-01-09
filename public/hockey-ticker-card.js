/**
 * Hockey Scoreboard Ticker Card
 * Version: 1.0.1
 * Last Updated: 2026-01-10 07:00:00
 * 
 * Features:
 * - Continuous marquee scroll through all matches
 * - Shows live matches with scores and game time
 * - Shows upcoming matches (BEFORE_MATCH) with date and time
 * - Shows finished matches (AFTER_MATCH) with final scores
 * - Team logos and filtering support
 * - Wide, narrow format
 */
class HockeyTickerCard extends HTMLElement {
  static VERSION = '1.0.1';
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.matches = [];
    this.matchDetails = {}; // Store detailed match data with timing info
    this.currentMatchIndex = 0;
    this.scrollInterval = null;
    this.dataInterval = null;
    this.clockInterval = null;
    this.previousScores = {}; // Track previous scores per match for goal detection
    this.previousGoalCounts = {}; // Track previous goal counts per match for goal detection
    
    // Log version for debugging cache issues
    console.log(`[HockeyTickerCard] Version ${HockeyTickerCard.VERSION} loaded at ${new Date().toISOString()}`);
  }

  setConfig(config) {
    this.config = {
      league_id: config.league_id || 4,
      season: config.season || 2025,
      update_interval: config.update_interval || 10,
      scroll_speed: config.scroll_speed || 3, // seconds per match
      teams: config.teams || null,
      league_matches_url: `https://s3.dualstack.eu-west-1.amazonaws.com/den.hokejovyzapis.cz/league-matches/${config.season || 2025}/${config.league_id || 4}.json`,
      ...config
    };
    
    // Normalize teams to array if string provided
    if (this.config.teams && typeof this.config.teams === 'string') {
      this.config.teams = [this.config.teams];
    }
    if (this.config.teams && Array.isArray(this.config.teams)) {
      this.config.teams = this.config.teams.map(t => t.toUpperCase());
    }
  }

  // Team logo mapping
  getTeamLogoUrl(shortcut) {
    const logoMap = {
      'RUN': 'https://den.hokejovyzapis.cz/img/logos/1.png',
      'SON': 'https://den.hokejovyzapis.cz/img/logos/2.png',
      'FRE': 'https://den.hokejovyzapis.cz/img/logos/3.png',
      'AAL': 'https://den.hokejovyzapis.cz/img/logos/4.png',
      'ESB': 'https://den.hokejovyzapis.cz/img/logos/5.png',
      'HER': 'https://den.hokejovyzapis.cz/img/logos/6.png',
      'HLV': 'https://den.hokejovyzapis.cz/img/logos/7.png',
      'ROD': 'https://den.hokejovyzapis.cz/img/logos/8.png',
      'ODE': 'https://den.hokejovyzapis.cz/img/logos/9.png'
    };
    return logoMap[shortcut.toUpperCase()] || null;
  }

  connectedCallback() {
    this.render();
    this.loadMatches();
    this.dataInterval = setInterval(() => this.loadMatches(), this.config.update_interval * 1000);
    
    // Start clock interval to update running times for live matches
    this.clockInterval = setInterval(() => {
      this.updateRunningTimes();
    }, 1000); // Update every second
  }

  disconnectedCallback() {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
    }
    if (this.dataInterval) {
      clearInterval(this.dataInterval);
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  updateRunningTimes() {
    // Update ticker display to refresh running times for live matches
    // This will recalculate approximate times based on elapsed time
    if (this.matches.length > 0) {
      this.updateTicker();
    }
  }

  showGoalNotification(data, previousGoalCount) {
    // This matches the scoreboard card logic exactly
    const allGoals = [
      ...(data.data.homeGoals || []),
      ...(data.data.awayGoals || [])
    ];

    if (allGoals.length === 0) return;

    allGoals.sort((a, b) => (b.goalNr || 0) - (a.goalNr || 0));
    const latestGoal = allGoals[0];

    if (latestGoal.goalNr <= previousGoalCount) return;

    const isHomeGoal = data.data.homeGoals?.some(g => g.guid === latestGoal.guid);
    const teamName = isHomeGoal ? data.data.gameData.homeTeamLongname : data.data.gameData.awayTeamLongname;
    const teamShortcut = isHomeGoal ? data.data.gameData.homeTeamShortname : data.data.gameData.awayTeamShortname;
    const teamLogo = this.getTeamLogoUrl(teamShortcut);

    // Parse new score and previous score to find which number changed
    const newScoreParts = latestGoal.newScore.split(':');
    const newHomeScore = parseInt(newScoreParts[0]) || 0;
    const newAwayScore = parseInt(newScoreParts[1]) || 0;
    
    let previousHomeScore = newHomeScore;
    let previousAwayScore = newAwayScore;
    
    // Use the stored previous score for this match (we'll track it per match)
    const matchId = this.currentMatchId || 'unknown';
    if (this.previousScores[matchId]) {
      const prevParts = this.previousScores[matchId].split(':');
      previousHomeScore = parseInt(prevParts[0]) || 0;
      previousAwayScore = parseInt(prevParts[1]) || 0;
    }
    
    // Determine which score changed
    const homeChanged = newHomeScore !== previousHomeScore;
    const awayChanged = newAwayScore !== previousAwayScore;
    
    // Format score with bold on changed number (using dash instead of colon)
    let scoreDisplay = '';
    if (homeChanged) {
      scoreDisplay = `<strong>${newHomeScore}</strong>-${newAwayScore}`;
    } else if (awayChanged) {
      scoreDisplay = `${newHomeScore}-<strong>${newAwayScore}</strong>`;
    } else {
      // Fallback: convert colon to dash if no change detected
      scoreDisplay = latestGoal.newScore.replace(':', '-');
    }

    // Show the goal notification overlay
    const notificationEl = this.shadowRoot.querySelector('#goalNotification');
    if (notificationEl) {
      // Format scorer and assists text
      const scorerText = `${latestGoal.scoredBy.playerFirstname} ${latestGoal.scoredBy.playerLastname}`;
      let assistText = '';
      if (latestGoal.assistBy) {
        assistText = ` (${latestGoal.assistBy.playerFirstname} ${latestGoal.assistBy.playerLastname}`;
        if (latestGoal.assist2By) {
          assistText += `, ${latestGoal.assist2By.playerFirstname} ${latestGoal.assist2By.playerLastname}`;
        }
        assistText += ')';
      }
      
      notificationEl.innerHTML = `
        <div class="goal-notification-content">
          <div class="goal-team-score-line">
            ${teamLogo ? `<img src="${teamLogo}" class="goal-team-logo" onerror="this.style.display='none'">` : ''}
            <div class="goal-score">${scoreDisplay}</div>
          </div>
          <div class="goal-scorer">
            ${scorerText}${assistText}
          </div>
        </div>
      `;
      notificationEl.style.display = 'flex';
      
      // Store current score for next comparison
      this.previousScores[matchId] = latestGoal.newScore;
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        notificationEl.style.opacity = '0';
        setTimeout(() => {
          notificationEl.style.display = 'none';
          notificationEl.style.opacity = '1';
          notificationEl.innerHTML = '';
        }, 500);
      }, 8000);
    }
    
    // Update ticker with new score
    this.updateTicker();
  }

  async loadMatches() {
    try {
      const response = await fetch(this.config.league_matches_url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      if (data && data.matches) {
        let matches = data.matches;
        
        // Filter by teams if specified
        if (this.config.teams && this.config.teams.length > 0) {
          matches = matches.filter(match => {
            const homeShortcut = (match.home?.shortcut || '').toUpperCase();
            const guestShortcut = (match.guest?.shortcut || '').toUpperCase();
            return this.config.teams.some(team => 
              team === homeShortcut || team === guestShortcut
            );
          });
        }
        
        // Show all matches (finished, live, and upcoming)
        // No date filtering - show all matches from the league
        
        // Sort: LIVE first, then BEFORE_MATCH (by date), then AFTER_MATCH (most recent first)
        matches.sort((a, b) => {
          if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
          if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
          if (a.status === 'BEFORE_MATCH' && b.status === 'AFTER_MATCH') return -1;
          if (b.status === 'BEFORE_MATCH' && a.status === 'AFTER_MATCH') return 1;
          if (a.status === 'BEFORE_MATCH' && b.status === 'BEFORE_MATCH') {
            const dateA = new Date(a.start_date);
            const dateB = new Date(b.start_date);
            return dateA - dateB; // Earliest first (upcoming games)
          }
          if (a.status === 'AFTER_MATCH' && b.status === 'AFTER_MATCH') {
            const dateA = new Date(a.real_end_date || a.start_date);
            const dateB = new Date(b.real_end_date || b.start_date);
            return dateB - dateA; // Most recent first (finished games)
          }
          return 0;
        });
        
        this.matches = matches;
        
        // Fetch detailed data for LIVE matches to get accurate time
        // loadLiveMatchDetails will call updateTicker when done
        await this.loadLiveMatchDetails();
      }
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  }

  async loadLiveMatchDetails() {
    // Fetch detailed data for LIVE matches
    const liveMatches = this.matches.filter(m => m.status === 'LIVE' || m.status === 'DURING_MATCH');
    
    for (const match of liveMatches) {
      try {
        const response = await fetch(`https://s3-eu-west-1.amazonaws.com/den.hokejovyzapis.cz/widget/esports/match/${match.id}.json`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.data && data.data.gameData) {
            const gameData = data.data.gameData;
            
            // Initialize match detail object if it doesn't exist
            if (!this.matchDetails[match.id]) {
              this.matchDetails[match.id] = {
                previousGoalCount: 0,
                lastTimestamp: null,
                lastUpdateTimestamp: null,
                lastGameTimeSeconds: 0
              };
            }
            
            this.matchDetails[match.id].gameData = gameData;
            
            // Store goals data for goal tracking
            this.matchDetails[match.id].homeGoals = data.data.homeGoals || [];
            this.matchDetails[match.id].awayGoals = data.data.awayGoals || [];
            this.matchDetails[match.id].fullData = data; // Store full data for goal notification
            
            // Only update if game is live and not finished
            if (gameData.liveTimeString !== 'END-GAME' && gameData.gameStatus !== 0) {
              const currentGoalCount = (data.data.homeGoals?.length || 0) + (data.data.awayGoals?.length || 0);

              // Update stored game time and timestamp when new data arrives
              if (data.lastUpdate && data.lastUpdate.timestamp) {
                const newTimestamp = data.lastUpdate.timestamp;
                const newGameTime = gameData.liveTime || 0;
                
                // Store total time (not period time) so we can calculate period time correctly
                // when period changes
                if (newTimestamp !== this.matchDetails[match.id].lastUpdateTimestamp) {
                  this.matchDetails[match.id].lastUpdateTimestamp = new Date(newTimestamp).getTime();
                  this.matchDetails[match.id].lastGameTimeSeconds = newGameTime; // Store total time
                }
              }

              // Initialize previous goal count if not set (first time loading this match)
              if (this.matchDetails[match.id].previousGoalCount === undefined || 
                  this.matchDetails[match.id].previousGoalCount === null) {
                this.matchDetails[match.id].previousGoalCount = currentGoalCount;
              }
              
              // Initialize lastTimestamp if not set (first time loading this match)
              if (!this.matchDetails[match.id].lastTimestamp && data.lastUpdate && data.lastUpdate.timestamp) {
                this.matchDetails[match.id].lastTimestamp = data.lastUpdate.timestamp;
              }

              // Check for new goal - timestamp changed AND goal count increased (matching scoreboard logic exactly)
              if (this.matchDetails[match.id].lastTimestamp && 
                  data.lastUpdate && 
                  data.lastUpdate.timestamp !== this.matchDetails[match.id].lastTimestamp &&
                  currentGoalCount > this.matchDetails[match.id].previousGoalCount) {
                // Store match ID for score tracking
                this.currentMatchId = match.id;
                console.log(`[Ticker] Goal detected in match ${match.id}: ${currentGoalCount} goals (was ${this.matchDetails[match.id].previousGoalCount})`);
                this.showGoalNotification(data, this.matchDetails[match.id].previousGoalCount);
              }

              // Update stored values AFTER checking for goal (matching scoreboard logic)
              if (data.lastUpdate && data.lastUpdate.timestamp) {
                this.matchDetails[match.id].lastTimestamp = data.lastUpdate.timestamp;
              }
              this.matchDetails[match.id].previousGoalCount = currentGoalCount;
              
              // Store current score for comparison (update it each time for goal notification)
              const currentScore = `${gameData.homeTeamScore || 0}:${gameData.awayTeamScore || 0}`;
              this.previousScores[match.id] = currentScore;
            } else {
              // Game finished - clear timing info
              this.matchDetails[match.id].lastUpdateTimestamp = null;
              this.matchDetails[match.id].lastGameTimeSeconds = 0;
              this.matchDetails[match.id].previousGoalCount = 0;
              this.matchDetails[match.id].lastTimestamp = null;
              // Keep scores for finished game display
            }
          }
        }
      } catch (error) {
        console.error(`Error loading match ${match.id} details:`, error);
      }
    }
    
    // Update ticker display with new data (only if not already updated)
    // This is called from loadMatches, so we update the ticker here
    if (this.matches.length > 0) {
      this.updateTicker();
    }
  }

  formatGameTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `<span class="time-minutes">${minutes}</span><span class="time-apostrophe">'</span>`;
  }

  formatTimeForDisplay(timeString, periodNumber) {
    // Convert "15:32" format to period time format "15'" with blinking apostrophe
    // timeString is cumulative time, need to extract period time using period number
    if (!timeString) return '';
    const currentPeriod = periodNumber || 1;
    
    const match = timeString.match(/^(\d+):(\d+)/);
    if (match) {
      const totalMinutes = parseInt(match[1], 10);
      const totalSeconds = parseInt(match[2], 10);
      const totalTimeSeconds = totalMinutes * 60 + totalSeconds;
      const periodTimeSeconds = this.getPeriodTimeFromTotal(totalTimeSeconds, currentPeriod);
      const periodMinutes = Math.floor(periodTimeSeconds / 60);
      return `<span class="time-minutes">${periodMinutes}</span><span class="time-apostrophe">'</span>`;
    }
    // If already in minutes format, assume it's cumulative and calculate period time
    const minutesMatch = timeString.match(/^(\d+)/);
    if (minutesMatch) {
      const totalMinutes = parseInt(minutesMatch[1], 10);
      const totalTimeSeconds = totalMinutes * 60;
      const periodTimeSeconds = this.getPeriodTimeFromTotal(totalTimeSeconds, currentPeriod);
      const periodMinutes = Math.floor(periodTimeSeconds / 60);
      return `<span class="time-minutes">${periodMinutes}</span><span class="time-apostrophe">'</span>`;
    }
    return timeString;
  }

  getApproximateGameTime(matchId) {
    if (!this.matchDetails[matchId] || 
        !this.matchDetails[matchId].lastUpdateTimestamp || 
        this.matchDetails[matchId].lastGameTimeSeconds === undefined) {
      return null;
    }
    const matchDetail = this.matchDetails[matchId];
    const gameData = matchDetail.gameData;
    if (!gameData) return null;
    
    const now = Date.now();
    const elapsedRealTime = (now - matchDetail.lastUpdateTimestamp) / 1000; // Convert to seconds
    const totalTime = matchDetail.lastGameTimeSeconds + elapsedRealTime;
    
    // Get current period number from game data
    const currentPeriod = gameData.liveTimePeriod || 1;
    
    // Calculate period time: subtract completed periods (each is 20 minutes = 1200 seconds)
    const PERIOD_LENGTH_SECONDS = 1200; // 20 minutes
    const completedPeriodsTime = (currentPeriod - 1) * PERIOD_LENGTH_SECONDS;
    const periodTime = totalTime - completedPeriodsTime;
    
    // Ensure period time doesn't exceed period length (cap at 20 minutes)
    return Math.min(periodTime, PERIOD_LENGTH_SECONDS);
  }
  
  getPeriodTimeFromTotal(totalTimeSeconds, periodNumber) {
    // Calculate period time from total match time using period number
    // Each period is 20 minutes = 1200 seconds
    const PERIOD_LENGTH_SECONDS = 1200; // 20 minutes
    
    // Subtract completed periods (period 1 = 0, period 2 = 1200, period 3 = 2400, etc.)
    const completedPeriodsTime = (periodNumber - 1) * PERIOD_LENGTH_SECONDS;
    const periodTime = totalTimeSeconds - completedPeriodsTime;
    
    // Ensure period time doesn't exceed period length
    return Math.min(Math.max(periodTime, 0), PERIOD_LENGTH_SECONDS);
  }

  translatePeriod(periodText) {
    if (!periodText) return '';
    
    const periodUpper = periodText.toString().toUpperCase().trim();
    
    // Translate common period formats
    if (periodUpper.includes('1ST') || periodUpper.includes('1.') || periodUpper === '1' || periodUpper.includes('FIRST') || periodUpper === '1. PER') {
      return '1. periode';
    }
    if (periodUpper.includes('2ND') || periodUpper.includes('2.') || periodUpper === '2' || periodUpper.includes('SECOND') || periodUpper === '2. PER') {
      return '2. periode';
    }
    if (periodUpper.includes('3RD') || periodUpper.includes('3.') || periodUpper === '3' || periodUpper.includes('THIRD') || periodUpper === '3. PER') {
      return '3. periode';
    }
    if (periodUpper.includes('INTERMISSION') || periodUpper.includes('PAUSE')) {
      return 'Pause';
    }
    if (periodUpper.includes('OVERTIME') || periodUpper.includes('FORLÆNGET')) {
      return 'Forlænget spilletid';
    }
    
    // If it's just a number, add "periode"
    if (/^\d+$/.test(periodUpper)) {
      return `${periodUpper}. periode`;
    }
    
    // Return as-is if no match (might already be in Danish or other format)
    return periodText;
  }

  getMatchDisplay(match) {
    const homeShortcut = match.home?.shortcut || '';
    const guestShortcut = match.guest?.shortcut || '';
    const homeLogo = this.getTeamLogoUrl(homeShortcut);
    const guestLogo = this.getTeamLogoUrl(guestShortcut);
    
    let display = '';
    
    if (match.status === 'LIVE' || match.status === 'DURING_MATCH') {
      // Get period and time from detailed match data if available
      let periodTimeDisplay = '';
      let homeScore = match.results?.score?.final?.score_home || 0;
      let guestScore = match.results?.score?.final?.score_guest || 0;
      const matchDetail = this.matchDetails[match.id];
      
      if (matchDetail && matchDetail.gameData) {
        const gameData = matchDetail.gameData;
        
        // Use scores from detailed match data (more up-to-date)
        homeScore = gameData.homeTeamScore || homeScore;
        guestScore = gameData.awayTeamScore || guestScore;
        
        const period = this.translatePeriod(gameData.liveTimePeriod || gameData.liveTimeGamePhase || '');
        
        // Check if game is finished
        const currentPeriod = gameData.liveTimePeriod || 1;
        if (gameData.liveTimeString === 'END-GAME' || gameData.gameStatus === 0) {
          const time = this.formatTimeForDisplay(gameData.liveTimeFormatted || '', currentPeriod);
          periodTimeDisplay = period ? `${period} - ${time}` : time || 'SLUT';
        }
        // Check if in intermission - don't run timer, just show "Pause"
        else if (gameData.liveTimeGamePhase && gameData.liveTimeGamePhase.toUpperCase().includes('INTERMISSION')) {
          periodTimeDisplay = 'Pause';
        }
        // Game is live - calculate approximate time
        else {
          const approximateTime = this.getApproximateGameTime(match.id);
          if (approximateTime !== null) {
            const time = this.formatGameTime(approximateTime);
            if (period && time) {
              periodTimeDisplay = `${period} - ${time}`;
            } else {
              periodTimeDisplay = time || (period || '');
            }
          } else {
            // Fallback to data from file
            const time = this.formatTimeForDisplay(gameData.liveTimeFormatted || '', currentPeriod);
            if (period && time) {
              periodTimeDisplay = `${period} - ${time}`;
            } else {
              periodTimeDisplay = period || time || '';
            }
          }
        }
      } else {
        // Fallback to league-matches data
        const period = this.translatePeriod(match.actual_time_alias || match.actual_time_name || '');
        let time = '';
        if (match.last_event_time) {
          time = this.formatGameTime(match.last_event_time);
        } else if (match.actual_time_name) {
          time = this.formatTimeForDisplay(match.actual_time_name);
        }
        if (period && time) {
          periodTimeDisplay = `${period} - ${time}`;
        } else {
          periodTimeDisplay = period || time || match.actual_time_name || '';
        }
      }
      
      display = `
        <div class="ticker-item">
          ${homeLogo ? `<img src="${homeLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
          <span class="team-name">${homeShortcut}</span>
          <span class="score">${homeScore}</span>
          <span class="separator">-</span>
          <span class="score">${guestScore}</span>
          <span class="team-name">${guestShortcut}</span>
          ${guestLogo ? `<img src="${guestLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
          <span class="status live">${periodTimeDisplay}</span>
        </div>
      `;
    } else if (match.status === 'BEFORE_MATCH') {
      // Upcoming match - format: (logo) HOME vs AWAY (logo) date time
      let dateTimeDisplay = '';
      if (match.start_date) {
        const startDate = new Date(match.start_date);
        // Always show date and time for upcoming matches
        const dateStr = startDate.toLocaleDateString('da-DK', {
          day: '2-digit',
          month: '2-digit'
        });
        const timeStr = startDate.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        dateTimeDisplay = `${dateStr} ${timeStr}`;
      }
      
      display = `
        <div class="ticker-item">
          ${homeLogo ? `<img src="${homeLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
          <span class="team-name">${homeShortcut}</span>
          <span class="separator">vs</span>
          <span class="team-name">${guestShortcut}</span>
          ${guestLogo ? `<img src="${guestLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
          <span class="status upcoming">${dateTimeDisplay}</span>
        </div>
      `;
    } else if (match.status === 'AFTER_MATCH') {
      // Finished match - format: (logo) HOME score - score AWAY (logo) SLUT
      const homeScore = match.results?.score?.final?.score_home || 0;
      const guestScore = match.results?.score?.final?.score_guest || 0;
      
      display = `
        <div class="ticker-item">
          ${homeLogo ? `<img src="${homeLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
          <span class="team-name">${homeShortcut}</span>
          <span class="score">${homeScore}</span>
          <span class="separator">-</span>
          <span class="score">${guestScore}</span>
          <span class="team-name">${guestShortcut}</span>
          ${guestLogo ? `<img src="${guestLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
          <span class="status finished">SLUT</span>
        </div>
      `;
    }
    
    return display;
  }

  updateTicker() {
    const tickerEl = this.shadowRoot.querySelector('#tickerContent');
    if (!tickerEl) return;
    
    if (this.matches.length === 0) {
      tickerEl.innerHTML = '<div class="ticker-item">Ingen kampe</div>';
      tickerEl.style.width = '100%';
      return;
    }
    
    // Duplicate matches for seamless loop
    const html = this.matches.map(match => this.getMatchDisplay(match)).join('');
    tickerEl.innerHTML = html + html; // Duplicate for seamless scroll
    
    this.startScrolling();
  }

  startScrolling() {
    const tickerEl = this.shadowRoot.querySelector('#tickerContent');
    if (!tickerEl || this.matches.length === 0) return;
    
    // Force a reflow to get accurate width
    tickerEl.offsetWidth;
    
    // Calculate actual width of one set (divide by 2 because content is duplicated)
    const firstSetWidth = tickerEl.scrollWidth / 2;
    
    // Remove old animation style if exists
    const oldStyle = this.shadowRoot.querySelector('#marqueeStyle');
    if (oldStyle) {
      oldStyle.remove();
    }
    
    // Calculate animation duration (pixels per second scroll speed)
    const pixelsPerSecond = 50;
    const duration = firstSetWidth / pixelsPerSecond;
    
    // Create style element with keyframes for continuous marquee
    const style = document.createElement('style');
    style.id = 'marqueeStyle';
    style.textContent = `
      @keyframes marqueeScroll {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(-${firstSetWidth}px);
        }
      }
      #tickerContent {
        animation: marqueeScroll ${duration}s linear infinite;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .card {
          background: var(--card-background-color, #fff);
          border-radius: 8px;
          padding: 8px 16px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          overflow: hidden;
          height: 60px;
          position: relative;
        }
        .ticker-container {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
          mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%);
        }
        #tickerContent {
          display: flex;
          width: auto;
          height: 100%;
          will-change: transform;
        }
        .ticker-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          flex: 0 0 auto;
          height: 100%;
          font-size: 13px;
          color: var(--primary-text-color, #333);
          padding: 0 24px;
          white-space: nowrap;
        }
        .team-logo {
          width: 20px;
          height: 20px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .team-name {
          font-weight: bold;
          min-width: 35px;
          text-align: left;
        }
        .score {
          font-weight: bold;
          font-size: 15px;
          min-width: 15px;
          text-align: center;
        }
        .separator {
          margin: 0 4px;
          color: var(--secondary-text-color, #666);
        }
        .status {
          margin-left: auto;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          white-space: nowrap;
        }
        .status.live {
          background: #4CAF50;
          color: white;
        }
        .status.live .time-minutes {
          font-weight: 500;
        }
        .status.live .time-apostrophe {
          font-size: 11px;
          font-weight: 500;
          animation: blink 2s infinite;
        }
        @keyframes blink {
          0%, 49.9% {
            opacity: 1;
          }
          50%, 99.9% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .status.upcoming {
          background: #2196F3;
          color: white;
        }
        .status.finished {
          background: #757575;
          color: white;
        }
        #goalNotification {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          background: #4CAF50;
          color: white;
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          border-radius: 8px;
          opacity: 1;
          transition: opacity 0.5s;
        }
        .goal-notification-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 0 16px;
        }
        .goal-team-score-line {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .goal-team-logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .goal-score {
          font-size: 24px;
          font-weight: 500;
          text-align: center;
        }
        .goal-score strong {
          font-weight: bold;
        }
        .goal-scorer {
          font-size: 14px;
          font-weight: 400;
          text-align: center;
          opacity: 0.9;
        }
      </style>
      <div class="card">
        <div class="ticker-container">
          <div id="tickerContent">
            <div class="ticker-item">Loading...</div>
          </div>
        </div>
        <div id="goalNotification"></div>
      </div>
    `;
  }

  getCardSize() {
    return 1;
  }
}

customElements.define('hockey-ticker-card', HockeyTickerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hockey-ticker-card',
  name: 'Hockey Ticker',
  description: 'Scrolling ticker showing multiple hockey matches',
});

