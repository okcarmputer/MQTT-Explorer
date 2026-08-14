import * as React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { Input, InputLabel, MenuItem, Select, SelectChangeEvent } from '@mui/material'
import { AppState } from '../reducers'
import { globalActions, settingsActions } from '../actions'
import { TopicOrder } from '../reducers/Settings'
import TimeLocale from '../components/SettingsDrawer/TimeLocale'
import BooleanSwitch from '../components/SettingsDrawer/BooleanSwitch'
import BrokerStatistics from '../components/SettingsDrawer/BrokerStatistics'
import { autoExpandLimitSet } from '../components/SettingsDrawer/Settings'
import './dashboard.css'

interface Props {
  actions: {
    settings: typeof settingsActions
    global: typeof globalActions
  }
  autoExpandLimit: number
  highlightTopicUpdates: boolean
  selectTopicWithMouseOver: boolean
  topicOrder: TopicOrder
  theme: 'light' | 'dark'
}

/**
 * The tree/topic browser's settings, previously a slide-out Drawer toggled
 * by the old TitleBar's hamburger menu (both removed) — now a collapsed
 * disclosure living directly at the top of the Explorer tab, styled to
 * match the rest of the dashboard instead of the vanilla MQTT-Explorer
 * light-drawer look. Same settings, same actions, just relocated/restyled.
 */
function ExplorerSettings({ actions, autoExpandLimit, highlightTopicUpdates, selectTopicWithMouseOver, topicOrder, theme }: Props) {
  const onChangeAutoExpand = (e: SelectChangeEvent<number>) => {
    actions.settings.setAutoExpandLimit(parseInt(String(e.target.value), 10))
  }

  const onChangeSorting = (e: SelectChangeEvent<TopicOrder>) => {
    actions.settings.setTopicOrder(e.target.value as TopicOrder)
  }

  return (
    <div className="cmom-dashboard">
      <details className="cmom-card cmom-explorer-settings">
        <summary>Explorer Settings</summary>
        <div className="cmom-explorer-settings-grid">
          <div className="cmom-explorer-settings-field">
            <InputLabel htmlFor="auto-expand">Auto Expand</InputLabel>
            <Select
              value={autoExpandLimit}
              onChange={onChangeAutoExpand}
              input={<Input name="auto-expand" id="auto-expand-label-placeholder" />}
              name="auto-expand"
              fullWidth
            >
              {autoExpandLimitSet.map(limit => (
                <MenuItem key={limit.limit} value={limit.limit}>
                  {limit.limit < 10000 && limit.limit > 0 ? `≤ ${limit.limit} topics` : limit.name}
                </MenuItem>
              ))}
            </Select>
          </div>

          <div className="cmom-explorer-settings-field">
            <InputLabel htmlFor="node-order">Topic Order</InputLabel>
            <Select
              value={topicOrder}
              onChange={onChangeSorting}
              input={<Input name="node-order" id="node-order-label-placeholder" />}
              displayEmpty
              name="node-order"
              fullWidth
            >
              <MenuItem value={TopicOrder.none}>
                <em>default</em>
              </MenuItem>
              <MenuItem value={TopicOrder.abc}>a-z</MenuItem>
              <MenuItem value={TopicOrder.messages}>{TopicOrder.messages}</MenuItem>
              <MenuItem value={TopicOrder.topics}>{TopicOrder.topics}</MenuItem>
            </Select>
          </div>

          <div className="cmom-explorer-settings-field">
            <TimeLocale />
          </div>

          <div className="cmom-explorer-settings-field">
            <BooleanSwitch
              title="Show Activity"
              tooltip="Topics blink when a new message arrives"
              value={highlightTopicUpdates}
              action={actions.settings.toggleHighlightTopicUpdates}
            />
          </div>

          <div className="cmom-explorer-settings-field">
            <BooleanSwitch
              title="Quick Preview"
              tooltip="Select topics on mouse over"
              value={selectTopicWithMouseOver}
              action={() => actions.settings.selectTopicWithMouseOver(!selectTopicWithMouseOver)}
            />
          </div>

          <div className="cmom-explorer-settings-field">
            <BooleanSwitch
              title="Dark Mode"
              tooltip="Enable dark theme"
              value={theme === 'dark'}
              action={actions.settings.toggleTheme}
              data-testid="dark-mode-toggle"
            />
          </div>
        </div>

        <BrokerStatistics />
      </details>
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  autoExpandLimit: state.settings.get('autoExpandLimit'),
  topicOrder: state.settings.get('topicOrder'),
  highlightTopicUpdates: state.settings.get('highlightTopicUpdates'),
  selectTopicWithMouseOver: state.settings.get('selectTopicWithMouseOver'),
  theme: state.settings.get('theme'),
})

const mapDispatchToProps = (dispatch: any) => ({
  actions: {
    settings: bindActionCreators(settingsActions, dispatch),
    global: bindActionCreators(globalActions, dispatch),
  },
})

export default connect(mapStateToProps, mapDispatchToProps)(ExplorerSettings)
