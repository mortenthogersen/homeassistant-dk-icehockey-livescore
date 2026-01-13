/**
 * Hockey Table Card
 * Version: 1.0.0
 * Last Updated: 10. jan. @ 19.00
 * 
 * Features:
 * - Shows current league standings/points table
 * - Auto-updates standings
 * - Highlights specified teams
 * - Shows position, points, games played, wins, losses, goals for/against
 */

class HockeyTableCard extends HTMLElement {
  static VERSION = '1.0.0';
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.tableData = null;
    this.dataInterval = null;
    
    // Log version for debugging cache issues
    console.log(`[HockeyTableCard] Version ${HockeyTableCard.VERSION} loaded at ${new Date().toISOString()}`);
  }

  // Team logo mapping
  getTeamLogoUrl(shortcut) {
    const logoMap = {
      'RUN': '/local/team-logos/1.png',
      'SON': '/local/team-logos/2.png',
      'FRE': '/local/team-logos/3.png',
      'AAL': '/local/team-logos/4.png',
      'ESB': '/local/team-logos/5.png',
      'HER': '/local/team-logos/6.png',
      'HLV': '/local/team-logos/7.png',
      'ROD': '/local/team-logos/8.png',
      'ODE': '/local/team-logos/9.png'
    };
    return logoMap[shortcut.toUpperCase()] || null;
  }

  static getConfigElement() {
    return document.createElement('hockey-table-card-editor');
  }

  static getStubConfig() {
    return {
      season: 2025,
      highlight_teams: [],
      update_interval: 3600
    };
  }

  setConfig(config) {
    // Construct URL from season (league_id is always 1 for table)
    const season = config.season || 2025;
    const leagueId = 1; // Always 1 for table
    const tableUrl = `https://s3.dualstack.eu-west-1.amazonaws.com/den.hokejovyzapis.cz/table/${season}/${leagueId}.json`;
    
    this.config = {
      ...HockeyTableCard.getStubConfig(),
      ...config,
      table_url: tableUrl
    };
    this.render();
    this.loadTableData();
  }

  connectedCallback() {
    if (this.config) {
      this.dataInterval = setInterval(() => {
        this.loadTableData();
      }, (this.config.update_interval || 30) * 1000);
    }
  }

  disconnectedCallback() {
    if (this.dataInterval) {
      clearInterval(this.dataInterval);
      this.dataInterval = null;
    }
  }

  async loadTableData() {
    try {
      const response = await fetch(this.config.table_url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Data structure: array with one object containing clubs array
      if (Array.isArray(data) && data.length > 0 && data[0].clubs) {
        this.tableData = data[0].clubs;
        this.updateTable();
      } else {
        throw new Error('Invalid data format');
      }
    } catch (error) {
      console.error('Error loading table data:', error);
      this.showError(`Fejl ved indlæsning af data: ${error.message}`);
    }
  }

  updateTable() {
    const tableBody = this.shadowRoot.querySelector('#tableBody');
    if (!tableBody || !this.tableData) return;

    // Teams are already sorted by position in the data
    tableBody.innerHTML = this.tableData.map(team => {
      const highlightClass = this.isHighlighted(team.shortcut) ? 'highlighted' : '';
      const liveClass = team.live ? 'live' : '';
      const teamLogo = this.getTeamLogoUrl(team.shortcut);
      const goalDiffNum = team.score1 - team.score2;
      const goalDiff = this.formatGoalDifference(goalDiffNum);
      const goalDiffClass = goalDiffNum > 0 ? 'positive' : goalDiffNum < 0 ? 'negative' : '';
      
      return `
        <tr class="${highlightClass} ${liveClass}">
          <td class="position">${team.position}</td>
          <td class="team">
            ${teamLogo ? `<img src="${teamLogo}" class="team-logo" onerror="this.style.display='none'">` : ''}
            <span class="team-shortcut">${team.shortcut}</span>
            ${team.live && team.liveGameScore ? `<span class="live-badge">LIVE ${team.liveGameScore}</span>` : ''}
          </td>
          <td class="points">${team.points}</td>
          <td class="games">${team.games}</td>
          <td class="wins">${team.wins}</td>
          <td class="losses">${team.losts}</td>
          <td class="goals">${team.score1}:${team.score2}</td>
          <td class="goals-diff ${goalDiffClass}">${goalDiff}</td>
        </tr>
      `;
    }).join('');
  }

  formatGoalDifference(diff) {
    if (diff > 0) {
      return `+${diff}`;
    } else if (diff < 0) {
      return diff.toString();
    }
    return '0';
  }

  isHighlighted(teamShortcut) {
    if (!this.config.highlight_teams || this.config.highlight_teams.length === 0) {
      return false;
    }
    return this.config.highlight_teams.some(team => 
      team.toUpperCase() === teamShortcut.toUpperCase()
    );
  }

  showError(message) {
    const errorEl = this.shadowRoot.querySelector('#errorMessage');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
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
          font-family: var(--ha-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", Arial, sans-serif);
        }
        .error {
          color: var(--error-color, #f44336);
          padding: 12px;
          background: var(--error-background-color, #ffebee);
          border-radius: 4px;
          margin-bottom: 16px;
          display: none;
        }
        .table-container {
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        thead {
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
        }
        th {
          padding: 12px 8px;
          text-align: left;
          font-weight: 600;
          white-space: nowrap;
        }
        th.position {
          text-align: center;
          width: 40px;
        }
        th.points,
        th.games,
        th.wins,
        th.losses {
          text-align: center;
          width: 60px;
        }
        th.goals,
        th.goals-diff {
          text-align: center;
          width: 80px;
        }
        tbody tr {
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
          transition: background-color 0.2s;
        }
        tbody tr:hover {
          background: var(--secondary-background-color, #f5f5f5);
        }
        tbody tr.highlighted {
          background: var(--primary-background-color, rgba(3, 169, 244, 0.1));
          font-weight: 500;
        }
        tbody tr.live {
          border-left: 3px solid var(--accent-color, #4caf50);
        }
        tbody tr.highlighted.live {
          background: var(--primary-background-color, rgba(3, 169, 244, 0.15));
        }
        td {
          padding: 10px 8px;
        }
        td.position {
          text-align: center;
          font-weight: 600;
          color: var(--primary-color, #03a9f4);
        }
        td.team {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .team-logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .team-shortcut {
          font-weight: 600;
          min-width: 40px;
          color: var(--primary-text-color, #212121);
        }
        .team-name {
          color: var(--secondary-text-color, #757575);
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .live-badge {
          background: var(--accent-color, #4caf50);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          margin-left: auto;
        }
        td.points {
          text-align: center;
          font-weight: 600;
          font-size: 15px;
          color: var(--primary-color, #03a9f4);
        }
        td.games,
        td.wins,
        td.losses {
          text-align: center;
        }
        td.goals {
          text-align: center;
          font-family: monospace;
        }
        td.goals-diff {
          text-align: center;
          font-weight: 500;
        }
        td.goals-diff.positive {
          color: var(--success-color, #4caf50);
        }
        td.goals-diff.negative {
          color: var(--error-color, #f44336);
        }
        @media (max-width: 600px) {
          .team-name {
            display: none;
          }
          th, td {
            padding: 8px 4px;
            font-size: 12px;
          }
        }
      </style>
      <ha-card class="card">
        <div id="errorMessage" class="error"></div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th class="position">#</th>
                <th class="team">Hold</th>
                <th class="points">Point</th>
                <th class="games">Kampe</th>
                <th class="wins">Sejre</th>
                <th class="losses">Tab</th>
                <th class="goals">Mål</th>
                <th class="goals-diff">Mål±</th>
              </tr>
            </thead>
            <tbody id="tableBody">
              <tr>
                <td colspan="8" style="text-align: center; padding: 20px;">
                  Indlæser...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ha-card>
    `;
  }
}

customElements.define('hockey-table-card', HockeyTableCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hockey-table-card',
  name: 'Hockey Table Card',
  description: 'Shows current league standings/points table',
  preview: true
});

