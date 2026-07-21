import { refreshReleaseBadge } from './utils/release-notes';
import { loadShareSettings } from './utils/share';

App<IAppOption>({
  globalData: {},
  onLaunch() {
    loadShareSettings().catch(() => {});
    refreshReleaseBadge().catch(() => {});
  },
});
