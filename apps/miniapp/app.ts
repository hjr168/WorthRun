import { refreshReleaseBadge } from './utils/release-notes';
import { loadShareSettings } from './utils/share';
import { ensureWechatSession } from './utils/account';
import { recordActivity } from './utils/api';

App<IAppOption>({
  globalData: {},
  onLaunch() {
    loadShareSettings().catch(() => {});
    refreshReleaseBadge().catch(() => {});
    ensureWechatSession()
      .then((profile) =>
        profile ? recordActivity({ entryPage: 'app_launch' }) : undefined,
      )
      .catch(() => {});
  },
});
