import { getEventDisplayStatus } from '../../utils/event-detail';

Component({
  properties: {
    signupStatus: {
      type: String,
      value: 'unknown',
    },
    eventDate: {
      type: String,
      value: '',
    },
  },
  observers: {
    'signupStatus,eventDate'(signupStatus, eventDate) {
      this.setData(getEventDisplayStatus(signupStatus, eventDate));
    },
  },
  data: {
    text: '待确认',
    tone: 'muted',
  },
});
