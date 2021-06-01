import { observer } from 'mobx-react-lite';
import * as React from 'react';
import { FilterOptions } from './markers-filter.model';
import * as styles from './markers-filter.module.less';
import { MarkerService } from './markers-service';
import Messages from './messages';
import debounce = require('lodash.debounce');
import { useDisposable } from '@ali/ide-core-browser/lib/utils/react-hooks';
import { AutoFocusedInput } from '@ali/ide-main-layout/lib/browser/input';

import { MARKER_CONTAINER_ID } from '../common';

/**
 * Marker过滤面板
 */
export const MarkerFilterPanel = observer(() => {
  const markerService = MarkerService.useInjectable();

  const [filterValue, setFilterValue] = React.useState<string>('');

  useDisposable(() => {
    return [
      markerService.onMarkerFilterChanged((opt) => {
        if (opt === undefined) {
          setFilterValue('');
        }
      }),
    ];
  });

  const onChangeCallback = debounce((value) => {
    setFilterValue(value);
    markerService.fireFilterChanged(value ? new FilterOptions(value) : undefined);
  }, 250);

  return (
    <div className={styles.markerFilterContent}>
      <AutoFocusedInput
        containerId={MARKER_CONTAINER_ID}
        hasClear
        className={styles.filterInput}
        placeholder={Messages.markerPanelFilterInputPlaceholder()}
        value={filterValue}
        onValueChange={onChangeCallback} />
    </div>
  );
});
