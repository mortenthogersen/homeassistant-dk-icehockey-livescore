/**
 * Hockey Scoreboard Card
 * Version: 1.0.11
 * Last Updated: 10. jan. @ 19.00
 * 
 * Features:
 * - Live game scoreboard with auto-updates
 * - Goal notifications with bold score changes (inside card)
 * - Automatic game switching when matches go LIVE
 * - Finished game display as small line above
 * - Team filtering support
 * - Timer stops during intermissions
 * - Shows scheduled time for upcoming games
 * - Team logos support
 * - Main team and other teams display
 */
class HockeyScoreboardCard extends HTMLElement {
  static VERSION = '1.0.11';
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lastTimestamp = null;
    this.previousGoalCount = 0;
    this.lastUpdateTimestamp = null;
    this.lastGameTimeSeconds = 0;
    this.gameData = null;
    this.clockInterval = null;
    this.dataInterval = null;
    this.finishedMatchInfo = null;
    this.currentMatchInfo = null;
    this.nextGameCheckCounter = 0;
    this.previousScore = null;
    this.otherMatches = [];
    this.otherMatchDetails = {};
    this.otherMatchesInterval = null;
    // Cache for league-matches (fetch once per day)
    this.cachedLeagueMatches = null;
    this.cachedLeagueMatchesDate = null;
    
    // Log version for debugging cache issues
    console.log(`[HockeyScoreboardCard] Version ${HockeyScoreboardCard.VERSION} loaded at ${new Date().toISOString()}`);
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

  setConfig(config) {
    // Validate required configuration
    if (!config.main_team) {
      throw new Error('Configuration error: "main_team" is required. Please specify a team shortcut (e.g., ODE, HER, AAL)');
    }
    
    if (!config.other_teams || (Array.isArray(config.other_teams) && config.other_teams.length === 0)) {
      throw new Error('Configuration error: "other_teams" is required. Please specify an array of team shortcuts (e.g., [HER, AAL, HLV])');
    }
    
    // Build configuration - only support main_team + other_teams
    this.config = {
      main_team: config.main_team.toUpperCase(), // Main team shortcut to show full scoreboard (REQUIRED)
      other_teams: Array.isArray(config.other_teams) 
        ? config.other_teams.map(t => t.toUpperCase())
        : [config.other_teams.toUpperCase()], // Array of team shortcuts for ticker list below (REQUIRED)
      league_id: config.league_id || 1,
      season: config.season || 2025,
      update_interval: config.update_interval || 10,
      league_matches_url: config.league_matches_url || `/local/league-matches/${config.season || 2025}/${config.league_id || 1}.json`,
      // Internal fields (set during initialization)
      game_id: null,
      data_url: null
    };
    
    console.log(`[Scoreboard] Configuration: main_team=${this.config.main_team}, other_teams=[${this.config.other_teams.join(', ')}]`);
  }

  connectedCallback() {
    this.render();
    this.initializeGame();
    this.dataInterval = setInterval(() => this.loadGameData(), this.config.update_interval * 1000);
    this.clockInterval = setInterval(() => {
      this.updateClock();
      // Also update running times for other teams
      if (this.config.other_teams && this.otherMatches.length > 0) {
        this.updateOtherTeamsRunningTimes();
      }
    }, 1000);
  }
  
  updateOtherTeamsRunningTimes() {
    // Update running times for live matches in other teams list
    this.otherMatches.forEach(match => {
      if (match.status === 'LIVE' || match.status === 'DURING_MATCH') {
        const matchDetail = this.otherMatchDetails[match.id];
        if (matchDetail && matchDetail.gameData) {
          const gameData = matchDetail.gameData;
          if (gameData.liveTimeString !== 'END-GAME' && gameData.gameStatus !== 0) {
            if (!gameData.liveTimeGamePhase || !gameData.liveTimeGamePhase.toUpperCase().includes('INTERMISSION')) {
              // Game is live and not in intermission - update display
              this.updateOtherTeamsDisplay();
            }
          }
        }
      }
    });
  }

  async initializeGame() {
    // main_team is required - find and load its match
    try {
      const matches = await this.fetchLeagueMatches();
      console.log(`[Scoreboard] Looking for main_team: ${this.config.main_team}`);
      const mainMatch = this.findMatchByTeam(matches, this.config.main_team);
      
      if (mainMatch) {
        console.log(`[Scoreboard] Found main match for ${this.config.main_team}: ${mainMatch.id} - ${mainMatch.home?.shortcut} vs ${mainMatch.guest?.shortcut}`);
        this.config.game_id = mainMatch.id;
        this.config.data_url = `https://s3-eu-west-1.amazonaws.com/den.hokejovyzapis.cz/widget/esports/match/${mainMatch.id}.json`;
        this.currentMatchInfo = mainMatch;
        
        this.loadGameData();
      } else {
        // No match found for main_team - hide scoreboard and show error
        console.log(`[Scoreboard] No match found for ${this.config.main_team}`);
        this.hideScoreboard();
        this.showError(`Ingen kamp fundet for ${this.config.main_team} i dag`);
        this.config.data_url = null;
        this.config.game_id = null;
        
        // Still load other teams
        if (this.config.other_teams && this.config.other_teams.length > 0) {
          setTimeout(() => {
            this.loadOtherTeamsMatches();
            this.otherMatchesInterval = setInterval(() => this.loadOtherTeamsMatches(), this.config.update_interval * 1000);
          }, 500);
        }
        return;
      }
    } catch (error) {
      console.error('[Scoreboard] Error fetching league matches:', error);
      console.error('[Scoreboard] Error details:', {
        message: error.message,
        url: this.config.league_matches_url,
        stack: error.stack
      });
      this.hideScoreboard();
      this.showError(`Kunne ikke indlæse kamp program: ${error.message}`);
      this.config.data_url = null;
      this.config.game_id = null;
      return;
    }
    
    // Load other teams (required configuration)
    if (this.config.other_teams && this.config.other_teams.length > 0) {
      setTimeout(() => {
        this.loadOtherTeamsMatches();
        this.otherMatchesInterval = setInterval(() => this.loadOtherTeamsMatches(), this.config.update_interval * 1000);
      }, 500);
    }
  }
  
  findMatchByTeam(matches, teamShortcut) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find the most relevant match for the team (prioritize LIVE, then upcoming, then most recent finished)
    // Only search today's matches
    const teamMatches = matches.filter(match => {
      // Filter by team
      const homeShortcut = (match.home?.shortcut || '').toUpperCase();
      const guestShortcut = (match.guest?.shortcut || '').toUpperCase();
      if (homeShortcut !== teamShortcut && guestShortcut !== teamShortcut) {
        return false;
      }
      
      // Filter by date (today)
      if (!match.start_date) return false;
      const matchDate = new Date(match.start_date);
      matchDate.setHours(0, 0, 0, 0);
      return matchDate.getTime() === today.getTime();
    });
    
    if (teamMatches.length === 0) return null;
    
    // Sort: LIVE first, then BEFORE_MATCH (by date), then AFTER_MATCH (most recent first)
    teamMatches.sort((a, b) => {
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
      if (a.status === 'DURING_MATCH' && b.status !== 'DURING_MATCH') return -1;
      if (b.status === 'DURING_MATCH' && a.status !== 'DURING_MATCH') return 1;
      if (a.status === 'BEFORE_MATCH' && b.status === 'AFTER_MATCH') return -1;
      if (b.status === 'BEFORE_MATCH' && a.status === 'AFTER_MATCH') return 1;
      if (a.status === 'BEFORE_MATCH' && b.status === 'BEFORE_MATCH') {
        const dateA = new Date(a.start_date);
        const dateB = new Date(b.start_date);
        return dateA - dateB; // Earliest first
      }
      if (a.status === 'AFTER_MATCH' && b.status === 'AFTER_MATCH') {
        const dateA = new Date(a.real_end_date || a.start_date);
        const dateB = new Date(b.real_end_date || b.start_date);
        return dateB - dateA; // Most recent first
      }
      return 0;
    });
    
    return teamMatches[0];
  }
  
  async loadOtherTeamsMatches() {
    try {
      const matches = await this.fetchLeagueMatches();
      const otherTeamMatches = [];
      const seenMatchIds = new Set();
      
      // Get main team's match ID to exclude it from other teams list
      const mainMatchId = this.config.game_id || (this.currentMatchInfo && this.currentMatchInfo.id) || null;
      
      // Collect all matches for other teams first, then deduplicate
      for (const teamShortcut of this.config.other_teams) {
        // Skip if this team is the main team
        if (teamShortcut === this.config.main_team) {
          continue;
        }
        
        const match = this.findMatchByTeam(matches, teamShortcut);
        if (match) {
          // Skip if this is the main team's match
          if (match.id === mainMatchId) {
            continue;
          }
          
          // Only add if we haven't seen this match before (deduplicate)
          // This handles the case where both teams in a match are in other_teams
          if (!seenMatchIds.has(match.id)) {
            seenMatchIds.add(match.id);
            otherTeamMatches.push(match);
          }
        }
      }
      
      // Sort the other matches: LIVE first, then upcoming, then finished
      otherTeamMatches.sort((a, b) => {
        if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
        if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
        if (a.status === 'DURING_MATCH' && b.status !== 'DURING_MATCH') return -1;
        if (b.status === 'DURING_MATCH' && a.status !== 'DURING_MATCH') return 1;
        if (a.status === 'BEFORE_MATCH' && b.status === 'AFTER_MATCH') return -1;
        if (b.status === 'BEFORE_MATCH' && a.status === 'AFTER_MATCH') return 1;
        if (a.status === 'BEFORE_MATCH' && b.status === 'BEFORE_MATCH') {
          const dateA = new Date(a.start_date);
          const dateB = new Date(b.start_date);
          return dateA - dateB; // Earliest first
        }
        if (a.status === 'AFTER_MATCH' && b.status === 'AFTER_MATCH') {
          const dateA = new Date(a.real_end_date || a.start_date);
          const dateB = new Date(b.real_end_date || b.start_date);
          return dateB - dateA; // Most recent first
        }
        return 0;
      });
      
      this.otherMatches = otherTeamMatches;
      
      // Load detailed data for LIVE matches
      await this.loadOtherTeamDetails();
      
      // Update display
      this.updateOtherTeamsDisplay();
      
      // Start interval to update running times for other teams
      if (this.clockInterval) {
        // Clock interval already set in connectedCallback, it will handle this
      }
    } catch (error) {
      console.error('Error loading other teams matches:', error);
    }
  }
  
  async loadOtherTeamDetails() {
    const liveMatches = this.otherMatches.filter(m => m.status === 'LIVE' || m.status === 'DURING_MATCH');
    
    for (const match of liveMatches) {
      try {
        const response = await fetch(`https://s3-eu-west-1.amazonaws.com/den.hokejovyzapis.cz/widget/esports/match/${match.id}.json`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.data && data.data.gameData) {
            if (!this.otherMatchDetails[match.id]) {
              this.otherMatchDetails[match.id] = {
                lastUpdateTimestamp: null,
                lastGameTimeSeconds: 0
              };
            }
            this.otherMatchDetails[match.id].gameData = data.data.gameData;
            
            // Update timing info
            if (data.lastUpdate && data.lastUpdate.timestamp) {
              const newTimestamp = new Date(data.lastUpdate.timestamp).getTime();
              const newGameTime = data.data.gameData.liveTime || 0;
              
              if (newTimestamp !== this.otherMatchDetails[match.id].lastUpdateTimestamp) {
                this.otherMatchDetails[match.id].lastUpdateTimestamp = newTimestamp;
                this.otherMatchDetails[match.id].lastGameTimeSeconds = newGameTime;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error loading match ${match.id} details:`, error);
      }
    }
  }

  async fetchLeagueMatches() {
    // Check if we have cached data for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (this.cachedLeagueMatches && this.cachedLeagueMatchesDate) {
      const cachedDate = new Date(this.cachedLeagueMatchesDate);
      cachedDate.setHours(0, 0, 0, 0);
      
      // If cache is from today, return cached data
      if (cachedDate.getTime() === today.getTime()) {
        console.log('[Scoreboard] Using cached league-matches data');
        return this.cachedLeagueMatches;
      }
    }
    
    // Fetch new data (either no cache or different day)
    console.log('[Scoreboard] Fetching league-matches data (cache miss or new day)');
    console.log('[Scoreboard] URL:', this.config.league_matches_url);
    const response = await fetch(this.config.league_matches_url);
    if (!response.ok) {
      console.error('[Scoreboard] HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }
    const data = await response.json();
    console.log('[Scoreboard] Loaded data:', data ? 'success' : 'null', 'matches count:', data && data.matches ? data.matches.length : 0);
    const matches = data.matches || [];
    
    // Cache the data
    this.cachedLeagueMatches = matches;
    this.cachedLeagueMatchesDate = new Date();
    
    return matches;
  }

  findTodayMatch(matches) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find matches for today
    let todayMatches = matches.filter(match => {
      if (!match.start_date) return false;
      const matchDate = new Date(match.start_date);
      matchDate.setHours(0, 0, 0, 0);
      return matchDate.getTime() === today.getTime();
    });

    // Filter by team shortcuts if specified
    if (this.config.teams && this.config.teams.length > 0) {
      todayMatches = todayMatches.filter(match => {
        const homeShortcut = (match.home?.shortcut || '').toUpperCase();
        const guestShortcut = (match.guest?.shortcut || '').toUpperCase();
        // Check if either home or guest matches any of the specified teams
        return this.config.teams.some(team => 
          team === homeShortcut || team === guestShortcut
        );
      });
    }

    if (todayMatches.length === 0) {
      return { mainMatch: null, finishedMatch: null };
    }

    // Sort matches by start time
    todayMatches.sort((a, b) => {
      const dateA = new Date(a.start_date);
      const dateB = new Date(b.start_date);
      return dateA - dateB; // Earliest first
    });

    // Find live/ongoing matches first (status: "LIVE" or "DURING_MATCH")
    const liveMatches = todayMatches.filter(m => m.status === 'LIVE' || m.status === 'DURING_MATCH');
    if (liveMatches.length > 0) {
      // If multiple live matches, prioritize by:
      // 1. Team filter matches (if teams are specified)
      // 2. Earliest start time
      let selectedLiveMatch = liveMatches[0];
      
      if (this.config.teams && this.config.teams.length > 0) {
        // If teams are filtered, prefer a live match with those teams
        const filteredLiveMatches = liveMatches.filter(match => {
          const homeShortcut = (match.home?.shortcut || '').toUpperCase();
          const guestShortcut = (match.guest?.shortcut || '').toUpperCase();
          return this.config.teams.some(team => 
            team === homeShortcut || team === guestShortcut
          );
        });
        
        if (filteredLiveMatches.length > 0) {
          // Pick the earliest starting filtered match
          filteredLiveMatches.sort((a, b) => {
            const dateA = new Date(a.start_date);
            const dateB = new Date(b.start_date);
            return dateA - dateB; // Earliest first
          });
          selectedLiveMatch = filteredLiveMatches[0];
        } else {
          // No filtered matches, pick earliest overall live match
          liveMatches.sort((a, b) => {
            const dateA = new Date(a.start_date);
            const dateB = new Date(b.start_date);
            return dateA - dateB; // Earliest first
          });
          selectedLiveMatch = liveMatches[0];
        }
      } else {
        // No team filter - pick earliest live match
        liveMatches.sort((a, b) => {
          const dateA = new Date(a.start_date);
          const dateB = new Date(b.start_date);
          return dateA - dateB; // Earliest first
        });
        selectedLiveMatch = liveMatches[0];
      }
      
      // Find the most recent finished match before this live one
      const finishedBefore = todayMatches
        .filter(m => m.status === 'AFTER_MATCH' && 
          new Date(m.real_end_date || m.start_date) < new Date(selectedLiveMatch.start_date))
        .sort((a, b) => {
          const dateA = new Date(a.real_end_date || a.start_date);
          const dateB = new Date(b.real_end_date || b.start_date);
          return dateB - dateA; // Most recent first
        })[0];
      return { mainMatch: selectedLiveMatch, finishedMatch: finishedBefore || null };
    }

    // Find upcoming matches (status: "BEFORE_MATCH")
    const upcomingMatch = todayMatches.find(m => m.status === 'BEFORE_MATCH');
    if (upcomingMatch) {
      // Find the most recent finished match before this upcoming one
      const finishedBefore = todayMatches
        .filter(m => m.status === 'AFTER_MATCH' && 
          new Date(m.real_end_date || m.start_date) < new Date(upcomingMatch.start_date))
        .sort((a, b) => {
          const dateA = new Date(a.real_end_date || a.start_date);
          const dateB = new Date(b.real_end_date || b.start_date);
          return dateB - dateA;
        })[0];
      return { mainMatch: upcomingMatch, finishedMatch: finishedBefore || null };
    }

    // Only finished matches left - show most recent as main, previous as finished
    const finishedMatches = todayMatches
      .filter(m => m.status === 'AFTER_MATCH')
      .sort((a, b) => {
        const dateA = new Date(a.real_end_date || a.start_date);
        const dateB = new Date(b.real_end_date || b.start_date);
        return dateB - dateA; // Most recent first
      });

    if (finishedMatches.length > 0) {
      return {
        mainMatch: finishedMatches[0],
        finishedMatch: finishedMatches.length > 1 ? finishedMatches[1] : null
      };
    }

    return { mainMatch: todayMatches[0] || null, finishedMatch: null };
  }

  disconnectedCallback() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
    if (this.dataInterval) {
      clearInterval(this.dataInterval);
    }
    if (this.otherMatchesInterval) {
      clearInterval(this.otherMatchesInterval);
    }
  }

  async loadGameData() {
    if (!this.config.data_url) {
      return;
    }

    try {
      const response = await fetch(this.config.data_url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();

      if (data && data.data) {
        // Hide error message if data loads successfully
        const errorEl = this.shadowRoot.querySelector('.error');
        if (errorEl) errorEl.style.display = 'none';

        const gameData = data.data.gameData;
        
        // Check if match hasn't started yet (BEFORE_MATCH status from league-matches)
        // Prioritize actual game data - if game has started, ignore BEFORE_MATCH status
        const hasGameStarted = (gameData.liveTime > 0) || 
                              (gameData.liveTimePeriod > 0) || 
                              (gameData.homeTeamScore > 0 || gameData.awayTeamScore > 0) ||
                              (gameData.liveTimeString && gameData.liveTimeString !== 'BEFORE_MATCH');
        
        const isBeforeMatch = !hasGameStarted && (this.currentMatchInfo && this.currentMatchInfo.status === 'BEFORE_MATCH');
        
        // Game is finished only if it's END-GAME AND not a BEFORE_MATCH match
        // For BEFORE_MATCH, gameStatus might be 0 meaning "not started", not "finished"
        const isGameFinished = !isBeforeMatch && (gameData.liveTimeString === 'END-GAME' || gameData.gameStatus === 0);

        // main_team is always set (required), so we don't auto-switch to other matches

        // Only update clock if game is not finished and not in intermission
        const isIntermission = gameData.liveTimeGamePhase && 
                               gameData.liveTimeGamePhase.toUpperCase().includes('INTERMISSION');
        
        if ((!isGameFinished || isBeforeMatch) && !isIntermission) {
          const currentGoalCount = (data.data.homeGoals?.length || 0) + (data.data.awayGoals?.length || 0);

          // Update stored game time and timestamp when new data arrives
          if (data.lastUpdate && data.lastUpdate.timestamp) {
            const newTimestamp = data.lastUpdate.timestamp;
            const newGameTime = gameData.liveTime || 0;
            
            // Store total time (not period time) so we can calculate period time correctly
            // when period changes
            if (newTimestamp !== this.lastUpdateTimestamp) {
              this.lastUpdateTimestamp = newTimestamp;
              this.lastGameTimeSeconds = newGameTime; // Store total time
            }
          }

          // Initialize previous goal count if not set (first time loading this match)
          if (this.previousGoalCount === undefined || this.previousGoalCount === null) {
            this.previousGoalCount = currentGoalCount;
          }
          
          // Initialize lastTimestamp if not set (first time loading this match)
          if (!this.lastTimestamp && data.lastUpdate && data.lastUpdate.timestamp) {
            this.lastTimestamp = data.lastUpdate.timestamp;
          }

          // Only check for goals if this is the main team's match (goal notifications should only show for main team)
          // If main_team is not configured, show notifications for the main scoreboard match
          const isMainTeamMatch = !this.config.main_team || 
                                  (this.currentMatchInfo && 
                                   (this.currentMatchInfo.home?.shortcut === this.config.main_team || 
                                    this.currentMatchInfo.guest?.shortcut === this.config.main_team));

          // Check for new goal - timestamp changed AND goal count increased (only for main team)
          if (isMainTeamMatch && 
              this.lastTimestamp && 
              data.lastUpdate &&
              data.lastUpdate.timestamp !== this.lastTimestamp &&
              currentGoalCount > this.previousGoalCount) {
            console.log(`[Scoreboard] Goal detected for main team match: ${currentGoalCount} goals (was ${this.previousGoalCount})`);
            this.showGoalNotification(data, this.previousGoalCount);
          }

          // Update stored values AFTER checking for goal
          if (data.lastUpdate && data.lastUpdate.timestamp) {
            this.lastTimestamp = data.lastUpdate.timestamp;
          }
          this.previousGoalCount = currentGoalCount;
          
          // Store current score for comparison (update it each time for goal notification)
          const currentScore = `${gameData.homeTeamScore || 0}:${gameData.awayTeamScore || 0}`;
          this.previousScore = currentScore;
        } else {
          // Game is finished - stop updating clock and reset goal tracking
          this.lastUpdateTimestamp = null;
          this.lastGameTimeSeconds = 0;
          this.previousGoalCount = 0;
          this.lastTimestamp = null;
        }

        this.updateScoreboard(data);
        this.gameData = data;
      }
    } catch (error) {
      console.error('Error loading game data:', error);
      this.showError(`Fejl ved indlæsning af data: ${error.message}. Forsøger igen...`);
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
    const currentPeriod = periodNumber || (this.gameData?.data?.gameData?.liveTimePeriod || 1);
    
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

  translatePeriod(periodText) {
    if (!periodText) return 'N/A';
    
    const periodUpper = periodText.toString().toUpperCase().trim();
    
    // Translate common period formats
    if (periodUpper.includes('1ST') || periodUpper.includes('1.') || periodUpper === '1' || periodUpper.includes('FIRST')) {
      return '1. periode';
    }
    if (periodUpper.includes('2ND') || periodUpper.includes('2.') || periodUpper === '2' || periodUpper.includes('SECOND')) {
      return '2. periode';
    }
    if (periodUpper.includes('3RD') || periodUpper.includes('3.') || periodUpper === '3' || periodUpper.includes('THIRD')) {
      return '3. periode';
    }
    if (periodUpper.includes('INTERMISSION') || periodUpper.includes('PAUSE')) {
      return 'Pause';
    }
    if (periodUpper.includes('OVERTIME') || periodUpper.includes('FORLÆNGET')) {
      return 'Forlænget spilletid';
    }
    if (periodUpper.includes('SHOOTOUT') || periodUpper.includes('STRF')) {
      return 'Straffesparkskonkurrence';
    }
    
    // If it's just a number, add "periode"
    if (/^\d+$/.test(periodUpper)) {
      return `${periodUpper}. periode`;
    }
    
    // Return as-is if no match (might already be in Danish or other format)
    return periodText;
  }

  getApproximateGameTime() {
    if (!this.lastUpdateTimestamp || this.lastGameTimeSeconds === undefined || !this.gameData) {
      return null;
    }
    const now = Date.now();
    const elapsedRealTime = (now - this.lastUpdateTimestamp) / 1000; // Convert to seconds
    const totalTime = this.lastGameTimeSeconds + elapsedRealTime;
    
    // Get current period number from game data
    const gameData = this.gameData.data.gameData;
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
  
  getApproximateGameTimeForOther(matchId) {
    const matchDetail = this.otherMatchDetails[matchId];
    if (!matchDetail || !matchDetail.lastUpdateTimestamp || matchDetail.lastGameTimeSeconds === undefined) {
      return null;
    }
    const gameData = matchDetail.gameData;
    if (!gameData) return null;
    
    const now = Date.now();
    const elapsedRealTime = (now - matchDetail.lastUpdateTimestamp) / 1000;
    const totalTime = matchDetail.lastGameTimeSeconds + elapsedRealTime;
    const currentPeriod = gameData.liveTimePeriod || 1;
    const PERIOD_LENGTH_SECONDS = 1200;
    const completedPeriodsTime = (currentPeriod - 1) * PERIOD_LENGTH_SECONDS;
    const periodTime = totalTime - completedPeriodsTime;
    return Math.min(periodTime, PERIOD_LENGTH_SECONDS);
  }
  
  formatGameTimeForOther(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `<span class="time-minutes">${minutes}</span><span class="time-apostrophe">'</span>`;
  }
  
  formatTimeForOtherDisplay(timeString, periodNumber) {
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
    return timeString;
  }
  
  getOtherMatchDisplay(match) {
    const homeShortcut = match.home?.shortcut || '';
    const guestShortcut = match.guest?.shortcut || '';
    const homeLogo = this.getTeamLogoUrl(homeShortcut);
    const guestLogo = this.getTeamLogoUrl(guestShortcut);
    
    let homeScore = match.results?.score?.final?.score_home || 0;
    let guestScore = match.results?.score?.final?.score_guest || 0;
    let periodTimeDisplay = '';
    let statusClass = '';
    let statusText = '';
    
    const matchDetail = this.otherMatchDetails[match.id];
    
    if (match.status === 'LIVE' || match.status === 'DURING_MATCH') {
      statusClass = 'live';
      
      if (matchDetail && matchDetail.gameData) {
        const gameData = matchDetail.gameData;
        homeScore = gameData.homeTeamScore || homeScore;
        guestScore = gameData.awayTeamScore || guestScore;
        const period = this.translatePeriod(gameData.liveTimePeriod || gameData.liveTimeGamePhase || '');
        const currentPeriod = gameData.liveTimePeriod || 1;
        
        if (gameData.liveTimeString === 'END-GAME' || gameData.gameStatus === 0) {
          statusClass = 'finished';
          statusText = 'SLUT';
        } else if (gameData.liveTimeGamePhase && gameData.liveTimeGamePhase.toUpperCase().includes('INTERMISSION')) {
          periodTimeDisplay = 'Pause';
        } else {
          const approximatePeriodTime = this.getApproximateGameTimeForOther(match.id);
          if (approximatePeriodTime !== null) {
            const time = this.formatGameTimeForOther(approximatePeriodTime);
            periodTimeDisplay = period && time ? `${period} - ${time}` : (period || time || '');
          } else {
            const time = this.formatTimeForOtherDisplay(gameData.liveTimeFormatted || '', currentPeriod);
            periodTimeDisplay = period && time ? `${period} - ${time}` : (period || time || '');
          }
        }
      } else {
        const period = this.translatePeriod(match.actual_time_alias || match.actual_time_name || '');
        let time = '';
        if (match.last_event_time) {
          time = this.formatGameTimeForOther(match.last_event_time);
        }
        periodTimeDisplay = period && time ? `${period} - ${time}` : (period || time || '');
      }
    } else if (match.status === 'BEFORE_MATCH') {
      statusClass = 'upcoming';
      statusText = this.formatStartTime(match.start_date) || '';
    } else if (match.status === 'AFTER_MATCH') {
      statusClass = 'finished';
      statusText = 'SLUT';
    }
    
    if (!periodTimeDisplay && !statusText) {
      statusText = match.actual_time_name || '';
    }
    
    return `
      <div class="other-team-item">
        ${homeLogo ? `<img src="${homeLogo}" class="other-team-logo" onerror="this.style.display='none'">` : ''}
        <span class="other-team-name">${homeShortcut}</span>
        <span class="other-team-score">${homeScore}</span>
        <span class="other-team-separator">-</span>
        <span class="other-team-score">${guestScore}</span>
        <span class="other-team-name">${guestShortcut}</span>
        ${guestLogo ? `<img src="${guestLogo}" class="other-team-logo" onerror="this.style.display='none'">` : ''}
        <span class="other-team-status ${statusClass}">
          ${periodTimeDisplay || statusText || ''}
        </span>
      </div>
    `;
  }
  
  updateOtherTeamsDisplay() {
    const sectionEl = this.shadowRoot.querySelector('#otherTeamsSection');
    const listEl = this.shadowRoot.querySelector('#otherTeamsList');
    
    if (!sectionEl || !listEl) return;
    
    if (this.otherMatches.length === 0) {
      sectionEl.style.display = 'none';
      return;
    }
    
    sectionEl.style.display = 'block';
    listEl.innerHTML = this.otherMatches.map(match => this.getOtherMatchDisplay(match)).join('');
  }

  formatStartTime(startDate) {
    if (!startDate) return '';
    try {
      const date = new Date(startDate);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('[Scoreboard] Invalid date:', startDate);
        return '';
      }
      // Always show date and time for upcoming matches in Danish format: "10. jan. @ 19.00"
      const day = date.getDate();
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
      const monthIndex = date.getMonth();
      if (monthIndex < 0 || monthIndex > 11) {
        console.warn('[Scoreboard] Invalid month index:', monthIndex);
        return '';
      }
      const month = monthNames[monthIndex];
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}.${minutes}`;
      return `${day}. ${month}. @ ${timeStr}`;
    } catch (e) {
      console.error('[Scoreboard] Error formatting date:', e, startDate);
      return '';
    }
  }

  updateClock() {
    if (!this.gameData || !this.gameData.data) return;

    const gameData = this.gameData.data.gameData;
    const periodEl = this.shadowRoot.querySelector('#period');

    // Check if game hasn't started yet (BEFORE_MATCH)
    // Prioritize actual game data over league-matches status
    // If game has liveTime, scores, or period > 0, it's live (not before match)
    const hasGameStarted = (gameData.liveTime > 0) || 
                          (gameData.liveTimePeriod > 0) || 
                          (gameData.homeTeamScore > 0 || gameData.awayTeamScore > 0) ||
                          (gameData.liveTimeString && gameData.liveTimeString !== 'BEFORE_MATCH');
    
    const isBeforeMatch = !hasGameStarted && (
      (this.currentMatchInfo && this.currentMatchInfo.status === 'BEFORE_MATCH') ||
      gameData.liveTimeString === 'BEFORE_MATCH' || 
      (gameData.liveTime === 0 && gameData.liveTimePeriod === 0 && !gameData.liveTimeString)
    );
    
    if (isBeforeMatch) {
      // Game hasn't started - show scheduled start time with "Kommende kamp"
      const startTime = this.currentMatchInfo?.start_date || gameData.scheduledTime || gameData.startTime;
      if (periodEl) {
        const formattedTime = this.formatStartTime(startTime) || 'Ikke fastlagt';
        periodEl.innerHTML = `<span class="period-status">Kommende kamp</span> - <span class="time-minutes">${formattedTime}</span>`;
      }
      return;
    }

    // Check if game is finished (check AFTER_MATCH status first, then END-GAME)
    const isAfterMatch = this.currentMatchInfo && this.currentMatchInfo.status === 'AFTER_MATCH';
    if (isAfterMatch || gameData.liveTimeString === 'END-GAME') {
      // Game is finished - show final time/status
      if (periodEl) periodEl.innerHTML = 'SLUT';
      return;
    }

    // Check if in intermission - timer should NOT run
    const isIntermission = gameData.liveTimeGamePhase && 
                          gameData.liveTimeGamePhase.toUpperCase().includes('INTERMISSION');
    
    if (isIntermission) {
      // During intermission - show "Pause" only, don't run timer
      if (periodEl) {
        periodEl.innerHTML = '<span class="period-status">Pause</span>';
      }
      return;
    }
    
    // Game is live - calculate approximate time
    const gameTime = this.getApproximateGameTime();
    const period = this.translatePeriod(gameData.liveTimePeriod);
    
    if (gameTime !== null) {
      // Using approximate time
      const time = this.formatGameTime(gameTime);
      if (periodEl) {
        if (period && time) {
          periodEl.innerHTML = `<span class="period-status">${period}</span> - ${time}`;
        } else {
          periodEl.innerHTML = period || time || 'N/A';
        }
      }
    } else {
      // Fallback to data from file
      const currentPeriod = gameData.liveTimePeriod || 1;
      const timeFormatted = this.formatTimeForDisplay(gameData.liveTimeFormatted || '0:00', currentPeriod);
      if (periodEl) {
        if (period && timeFormatted) {
          periodEl.innerHTML = `<span class="period-status">${period}</span> - ${timeFormatted}`;
        } else {
          periodEl.innerHTML = period || timeFormatted || 'N/A';
        }
      }
    }
  }

  updateScoreboard(data) {
    const gameData = data.data.gameData;
    const shadow = this.shadowRoot;

    // Show scoreboard when we have valid match data
    this.showScoreboard();

    // Update finished match display if available
    if (this.finishedMatchInfo) {
      this.updateFinishedMatchDisplay(this.finishedMatchInfo);
    }

    if (shadow.querySelector('#homeTeamName')) {
      shadow.querySelector('#homeTeamName').textContent = gameData.homeTeamLongname || '';
      shadow.querySelector('#awayTeamName').textContent = gameData.awayTeamLongname || '';
      
      // Update combined score display
      const scoreDisplayEl = shadow.querySelector('#scoreDisplay');
      if (scoreDisplayEl) {
        const homeScore = gameData.homeTeamScore || 0;
        const awayScore = gameData.awayTeamScore || 0;
        scoreDisplayEl.textContent = `${homeScore} - ${awayScore}`;
      }
      
      // Update team logos
      const homeLogoUrl = this.getTeamLogoUrl(gameData.homeTeamShortname);
      const awayLogoUrl = this.getTeamLogoUrl(gameData.awayTeamShortname);
      const homeLogoEl = shadow.querySelector('#homeLogo');
      const awayLogoEl = shadow.querySelector('#awayLogo');
      
      if (homeLogoEl && homeLogoUrl) {
        homeLogoEl.src = homeLogoUrl;
        homeLogoEl.style.display = 'block';
        // Show logo container when logo is available
        const homeLogoContainer = homeLogoEl.closest('.team-logo-container');
        if (homeLogoContainer) {
          homeLogoContainer.style.display = 'flex';
        }
      } else if (homeLogoEl) {
        homeLogoEl.style.display = 'none';
        const homeLogoContainer = homeLogoEl.closest('.team-logo-container');
        if (homeLogoContainer) {
          homeLogoContainer.style.display = 'none';
        }
      }
      
      if (awayLogoEl && awayLogoUrl) {
        awayLogoEl.src = awayLogoUrl;
        awayLogoEl.style.display = 'block';
        // Show logo container when logo is available
        const awayLogoContainer = awayLogoEl.closest('.team-logo-container');
        if (awayLogoContainer) {
          awayLogoContainer.style.display = 'flex';
        }
      } else if (awayLogoEl) {
        awayLogoEl.style.display = 'none';
        const awayLogoContainer = awayLogoEl.closest('.team-logo-container');
        if (awayLogoContainer) {
          awayLogoContainer.style.display = 'none';
        }
      }
      
      // Update previous score for goal notification comparison
      const currentScore = `${gameData.homeTeamScore || 0}:${gameData.awayTeamScore || 0}`;
      if (!this.previousScore) {
        this.previousScore = currentScore;
      }
      
      this.updateClock();
      
      if (data.lastUpdate) {
        const updateEl = shadow.querySelector('#lastUpdate');
        if (updateEl) {
          updateEl.textContent = `Sidst opdateret: ${data.lastUpdate.formattedShort || ''}`;
        }
      }
    }
  }

  updateFinishedMatchDisplay(finishedMatch) {
    const finishedEl = this.shadowRoot.querySelector('#finishedMatch');
    if (!finishedEl) return;

    const homeScore = finishedMatch.results?.score?.final?.score_home || 0;
    const guestScore = finishedMatch.results?.score?.final?.score_guest || 0;
    const homeName = finishedMatch.home?.shortcut || finishedMatch.home?.name || '';
    const guestName = finishedMatch.guest?.shortcut || finishedMatch.guest?.name || '';

    finishedEl.innerHTML = `
      <div class="finished-match">
        <span class="finished-label">SLUT:</span>
        <span class="finished-teams">${homeName} ${homeScore} - ${guestScore} ${guestName}</span>
      </div>
    `;
    finishedEl.style.display = 'block';
  }

  hideScoreboard() {
    const scoreboardContainer = this.shadowRoot.querySelector('.scoreboard-container');
    if (scoreboardContainer) {
      scoreboardContainer.style.display = 'none';
    }
  }

  showScoreboard() {
    const scoreboardContainer = this.shadowRoot.querySelector('.scoreboard-container');
    if (scoreboardContainer) {
      scoreboardContainer.style.display = 'flex';
    }
  }

  showError(message) {
    const errorEl = this.shadowRoot.querySelector('.error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  showGoalNotification(data, previousGoalCount) {
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
    
    if (this.previousScore) {
      const prevParts = this.previousScore.split(':');
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

    // Update the goal notification area inside the card
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
      notificationEl.style.display = 'block';
      
      // Store current score for next comparison
      this.previousScore = latestGoal.newScore;
      
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
          padding: 16px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .scoreboard-container {
          display: none;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        .team-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          min-width: 0;
        }
        .team-logo-container {
          background: white;
          border-radius: 8px;
          padding: 8px;
          margin-bottom: 8px;
          display: none;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          width: 76px;
          height: 76px;
        }
        .team-logo {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .team-name {
          font-size: 14px;
          font-weight: 500;
          text-align: center;
          color: var(--primary-text-color, #333);
          word-break: break-word;
        }
        .center-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 0 0 auto;
          min-width: 120px;
        }
        .score-display {
          font-size: 56px;
          font-weight: bold;
          color: var(--primary-color, #03a9f4);
          margin: 8px 0;
          line-height: 1;
        }
        .period-time-display {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-color, #03a9f4);
          text-align: center;
          margin-top: 4px;
        }
        .period-time-display .period-status {
          font-weight: 500;
          font-size: 14px;
          color: var(--primary-color, #03a9f4);
        }
        .period-time-display .time-minutes {
          font-weight: 500;
          font-size: 14px;
          color: var(--primary-color, #03a9f4);
        }
        .period-time-display .time-apostrophe {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-color, #03a9f4);
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
        .last-update {
          text-align: center;
          margin-top: 12px;
          color: var(--secondary-text-color, #999);
          font-size: 11px;
        }
        .version-info {
          text-align: center;
          margin-top: 4px;
          color: var(--secondary-text-color, #ccc);
          font-size: 9px;
          opacity: 0.7;
        }
        .error {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 4px;
          margin: 12px 0;
          text-align: center;
          display: none;
        }
        .finished-match {
          background: var(--divider-color, #f5f5f5);
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 12px;
          text-align: center;
          font-size: 12px;
          color: var(--secondary-text-color, #666);
          border-left: 3px solid var(--secondary-text-color, #999);
        }
        .finished-match .finished-label {
          font-weight: bold;
          margin-right: 8px;
        }
        .finished-match .finished-teams {
          font-weight: normal;
        }
        #finishedMatch {
          display: none;
        }
        #goalNotification {
          display: none;
          margin-top: 16px;
          padding: 12px;
          background: #4CAF50;
          color: white;
          border-radius: 4px;
          text-align: center;
          transition: opacity 0.5s;
        }
        .goal-notification-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
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
        .other-teams-section {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid var(--divider-color, #e0e0e0);
        }
        .other-teams-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--secondary-text-color, #666);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .other-teams-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .other-team-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          padding: 8px 12px;
          background: var(--card-background-color, #fafafa);
          border-radius: 4px;
          font-size: 13px;
          color: var(--primary-text-color, #333);
        }
        .other-team-logo {
          width: 20px;
          height: 20px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .other-team-name {
          font-weight: bold;
          min-width: 35px;
          text-align: left;
        }
        .other-team-score {
          font-weight: bold;
          font-size: 15px;
          min-width: 40px;
          text-align: center;
        }
        .other-team-separator {
          margin: 0 4px;
          color: var(--secondary-text-color, #666);
        }
        .other-team-status {
          margin-left: auto;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          white-space: nowrap;
        }
        .other-team-status.live {
          background: #4CAF50;
          color: white;
        }
        .other-team-status.live .time-minutes {
          font-weight: 500;
        }
        .other-team-status.live .time-apostrophe {
          font-size: 11px;
          font-weight: 500;
          animation: blink 2s infinite;
        }
        .other-team-status.upcoming {
          background: #2196F3;
          color: white;
        }
        .other-team-status.finished {
          background: #757575;
          color: white;
        }
        @media (max-width: 600px) {
          .card {
            padding: 12px;
          }
          .score-display {
            font-size: 42px;
          }
          .team-name {
            font-size: 12px;
          }
          .period-time-display {
            font-size: 12px;
          }
          .other-team-item {
            font-size: 12px;
            padding: 6px 10px;
          }
          .other-team-name {
            min-width: 30px;
            font-size: 12px;
          }
          .other-team-score {
            font-size: 13px;
            min-width: 35px;
          }
        }
      </style>
      <div class="card">
        <div id="finishedMatch"></div>
        <div class="scoreboard-container">
          <div class="team-section">
            <div class="team-logo-container">
              <img id="homeLogo" class="team-logo" style="display: none;" alt="Home team logo">
            </div>
            <div class="team-name" id="homeTeamName">Loading...</div>
          </div>
          <div class="center-section">
            <div class="score-display" id="scoreDisplay">0 - 0</div>
            <div class="period-time-display" id="periodTimeDisplay">
              <span id="period">-</span>
            </div>
          </div>
          <div class="team-section">
            <div class="team-logo-container">
              <img id="awayLogo" class="team-logo" style="display: none;" alt="Away team logo">
            </div>
            <div class="team-name" id="awayTeamName">Loading...</div>
          </div>
        </div>
        <div id="goalNotification"></div>
        <div class="last-update" id="lastUpdate"></div>
        <div class="error"></div>
        <div id="otherTeamsSection" class="other-teams-section" style="display: none;">
          <div class="other-teams-title">Andre kampe</div>
          <div id="otherTeamsList" class="other-teams-list"></div>
        </div>
      </div>
    `;
  }

  getCardSize() {
    return 3;
  }
}

customElements.define('hockey-scoreboard-card', HockeyScoreboardCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hockey-scoreboard-card',
  name: 'Hockey Scoreboard',
  description: 'Display live hockey game scoreboard - Standalone version',
});
