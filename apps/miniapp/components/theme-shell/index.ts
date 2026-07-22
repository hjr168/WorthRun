const THEME_STORAGE_KEY = 'worthrun_theme';

type ThemeName = 'light' | 'dark';

function readTheme(): ThemeName {
  return wx.getStorageSync(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function applyChrome(theme: ThemeName) {
  const dark = theme === 'dark';
  wx.setTabBarStyle({
    color: dark ? '#8899AA' : '#6B7A8D',
    selectedColor: '#FF5C1A',
    backgroundColor: dark ? '#162030' : '#FFFFFF',
    borderStyle: dark ? 'white' : 'black',
  });
}

function getNavigationMetrics() {
  const fallback = {
    navHeight: 64,
    capsuleTop: 24,
    navActionRight: 104,
    searchActionRight: 148,
  };
  try {
    const capsule = wx.getMenuButtonBoundingClientRect();
    const windowInfo = wx.getWindowInfo();
    const navActionRight = windowInfo.windowWidth - capsule.left + 8;
    return {
      navHeight: capsule.bottom + 8,
      capsuleTop: capsule.top,
      navActionRight,
      searchActionRight: navActionRight + 44,
    };
  } catch {
    return fallback;
  }
}

Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: {
      type: String,
      value: '',
    },
    showBack: {
      type: Boolean,
      value: false,
    },
    showSearch: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    theme: 'light' as ThemeName,
    ...getNavigationMetrics(),
  },
  lifetimes: {
    attached() {
      const theme = readTheme();
      this.setData({ theme });
      applyChrome(theme);
    },
  },
  pageLifetimes: {
    show() {
      const theme = readTheme();
      this.setData({ theme });
      applyChrome(theme);
    },
  },
  methods: {
    openSearch() {
      this.triggerEvent('search');
    },
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
        return;
      }
      wx.switchTab({ url: '/pages/home/index' });
    },
    toggleTheme() {
      const theme: ThemeName = this.data.theme === 'dark' ? 'light' : 'dark';
      wx.setStorageSync(THEME_STORAGE_KEY, theme);
      this.setData({ theme });
      applyChrome(theme);
    },
  },
});
