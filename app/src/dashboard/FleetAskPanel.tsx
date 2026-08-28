import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren } from './useTopicChildren'
import { useCurrentAnomalies } from './useAnomalyFeed'
import { buildFleetSnapshotText } from './fleetSnapshot'
import { getLLMService } from '../services/llmService'

interface Props {
  tree?: q.Tree<any>
  onClose: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTED_QUESTIONS = [
  'Which stations or sites are in alarm right now?',
  'Any pump stations with critical alarms today?',
  'Summarize current wet well levels.',
]

/**
 * Fleet-wide RAG chat — same llmService/sendMessage plumbing AIAssistant.tsx
 * (Explorer sidebar) uses for a single topic, but the context passed along
 * is a snapshot of every pump station + flow monitor (see fleetSnapshot.ts)
 * instead of one topic's neighborhood. Styled with this dashboard's own
 * cmom-* tokens (not AIAssistant's MUI withStyles) to match the rest of the
 * CMOM dashboard rather than the Explorer sidebar's look.
 */
export default function FleetAskPanel({ tree, onClose }: Props) {
  const flowDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const pumpDevices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const currentAnomalies = useCurrentAnomalies(flowDevices, pumpDevices)

  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const llmService = getLLMService()

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = React.useCallback(
    async (messageText?: string) => {
      const text = messageText || inputValue.trim()
      if (!text) return

      if (!llmService.hasApiKey()) {
        setError('LLM service not configured on server. Please contact your administrator.')
        return
      }

      setInputValue('')
      setError(null)
      setLoading(true)
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }])

      try {
        const snapshot = buildFleetSnapshotText(pumpDevices, flowDevices, currentAnomalies)
        const llmResponse = await llmService.sendMessage(text, snapshot)
        const parsed = llmService.parseResponse(llmResponse.response)
        setMessages(prev => [...prev, { role: 'assistant', content: parsed.text, timestamp: new Date() }])
      } catch (err: unknown) {
        const e = err as { message?: string }
        setError(e.message || 'Failed to get response from AI assistant')
      } finally {
        setLoading(false)
      }
    },
    [inputValue, pumpDevices, flowDevices, currentAnomalies, llmService]
  )

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="cmom-dashboard"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--cmom-bg, #0a0e14)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--cmom-space-3, 12px) var(--cmom-space-4, 16px)',
          borderBottom: '1px solid var(--cmom-border, rgba(128,128,128,0.15))',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--cmom-text-primary)' }}>
          Ask the Fleet
          <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, opacity: 0.6 }}>
            {pumpDevices.length} pump station(s), {flowDevices.length} flow monitor(s)
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--cmom-radius-sm, 4px)',
            border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 'var(--cmom-space-4, 16px)' }}>
        {messages.length === 0 && (
          <div style={{ opacity: 0.75 }}>
            <div style={{ marginBottom: 12 }}>
              Ask a question about live data across every pump station and flow monitor — anomalies, current
              readings, wet well info, runtimes.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTED_QUESTIONS.map(question => (
                <button
                  key={question}
                  type="button"
                  onClick={() => handleSend(question)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--cmom-radius-sm, 4px)',
                    border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
                    background: 'var(--cmom-surface-elevated, #1c2229)',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div
              style={{
                maxWidth: '75%',
                padding: '8px 12px',
                borderRadius: 'var(--cmom-radius-md, 12px)',
                background: m.role === 'user' ? 'var(--cmom-accent, #2ea043)' : 'var(--cmom-surface-elevated, #1c2229)',
                color: m.role === 'user' ? '#fff' : 'var(--cmom-text-primary)',
                whiteSpace: 'pre-wrap',
                fontSize: 13,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && <div style={{ opacity: 0.7, fontSize: 13 }}>Thinking…</div>}
        {error && (
          <div style={{ color: 'var(--cmom-status-offline, #f44336)', fontSize: 13, marginTop: 8 }}>{error}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 'var(--cmom-space-3, 12px) var(--cmom-space-4, 16px)',
          borderTop: '1px solid var(--cmom-border, rgba(128,128,128,0.15))',
        }}
      >
        <textarea
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the fleet…"
          rows={1}
          style={{
            flex: '1 1 auto',
            resize: 'none',
            padding: '8px 10px',
            borderRadius: 'var(--cmom-radius-sm, 4px)',
            border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
            background: 'var(--cmom-surface-elevated, #1c2229)',
            color: 'inherit',
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={loading || !inputValue.trim()}
          className="cmom-topbar-button"
        >
          Send
        </button>
      </div>
    </div>
  )
}
