import { complianceNotice, labelOf, runJudgementLabels } from '../../utils/format';

Component({
  properties: {
    event: {
      type: Object,
      value: {},
    },
  },
  observers: {
    event(value) {
      this.setData({
        judgementText: labelOf(runJudgementLabels, value?.runJudgement),
        reasons: value?.judgementReasons || [],
        notice: complianceNotice,
      });
    },
  },
  data: {
    judgementText: '',
    reasons: [] as string[],
    notice: complianceNotice,
  },
});
