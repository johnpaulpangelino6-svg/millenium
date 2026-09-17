// ==========================================================================
// STATE MANAGER - Centralized Application State (OOP)
// ==========================================================================

class StateManager {
  constructor() {
    this.state = {
      currentRole: 'admin',
      currentTab: 'dashboard',
      currentUser: null,
      devices: [],
      tickets: [],
      warranties: [],
      inventory: [],
      cms: [],
      predictiveAlerts: [],
      auditLogs: [],
      customers: [],
      allUsers: [],
      dataManagerSubTab: 'users',
      stats: null,
      selectedDeviceForRemote: null,
      selectedDeviceForQR: null,
      selectedTicket: null,
      searchQuery: '',
      filterModel: '',
      filterStatus: '',
      dashboardCabinetView: 'all',
      cabinetOpen: {
        devices: true,
        tickets: true,
        activity: true,
      },
      showAllKpiCards: false,
      simulatorMode: 'theater',
      activeFeatureDemo: null,
      demoTourActive: false,
      dongleConnected: true,
      stylusColor: '#00f2fe',
      stylusSize: 3,
      stylusTool: 'pen',
      stylusShape: 'freehand',
      isDrawing: false,
      theaterState: {
        playing: true,
        channel: 'nature',
        resolution: '4K UHD',
        timeSeconds: 142,
        totalSeconds: 360,
        audioMode: 'Dolby Atmos',
        antiGlareSplit: 50,
        volume: 85,
      },
      windowsState: {
        activeApp: 'powerpoint',
        slideIdx: 0,
        startMenuOpen: false,
        teamsMuted: false,
        teamsCamera: true,
        edgeUrl: 'https://brains.asia/millennium',
      },
      androidState: {
        quickSettingsOpen: false,
        eyeCare: false,
        brightness: 90,
        volume: 85,
        wifiConnected: true,
        hotspotActive: true,
        screenCastActive: true,
        activeApp: null,
      },
      opsEjected: false,
      noiseSuppressionActive: true,
    };
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
  }

  update(updates) {
    Object.assign(this.state, updates);
  }

  getAll() {
    return this.state;
  }

  reset() {
    this.state.devices = [];
    this.state.tickets = [];
    this.state.warranties = [];
    this.state.inventory = [];
    this.state.cms = [];
    this.state.predictiveAlerts = [];
    this.state.auditLogs = [];
    this.state.customers = [];
    this.state.allUsers = [];
    this.state.stats = null;
  }
}
