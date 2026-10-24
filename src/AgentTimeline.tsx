import { I, Spinner } from './ui';
import type { AgentEvent } from './api';

export type StepState = 'waiting' | 'running' | 'done' | 'attention' | 'failed';
export interface TimelineStep {
  id: string;
  title: string;
  tool?: string;
  state: StepState;
  detail?: string;
}

const STATE_TEXT: Record<StepState, string> = {
  waiting: 'Waiting', running: 'Running', done: 'Completed', attention: 'Needs attention', failed: 'Failed',
};

function StepIcon({ state }: { state: StepState }) {
  if (state === 'running') return <Spinner size={16} />;
  if (state === 'done') return <I.Check size={16} aria-hidden="true" />;
  if (state === 'attention') return <I.TriangleAlert size={15} aria-hidden="true" />;
  if (state === 'failed') return <I.X size={16} aria-hidden="true" />;
  return <span className="step-dot" aria-hidden="true" />;
}

/**
 * Vertical timeline of the agent workflow. State comes from real request state;
 * detail and duration come from the tool events recorded by the backend.
 */
export function AgentTimeline({ steps, events }: { steps: TimelineStep[]; events: AgentEvent[] }) {
  const latest = new Map<string, AgentEvent>();
  for (const e of [...events].reverse()) latest.set(e.tool, e);
  return (
    <section className="timeline-panel" aria-labelledby="tl-h">
      <h2 id="tl-h" className="panel-title">Agent activity</h2>
      <p className="panel-sub">What the agent has actually done for this report.</p>
      <ol className="vtl" aria-live="polite">
        {steps.map((s, i) => {
          const ev = s.tool ? latest.get(s.tool) : undefined;
          const showEv = ev && (s.state === 'done' || s.state === 'attention' || s.state === 'failed');
          return (
            <li key={s.id} className={`vtl-step is-${s.state}`} style={{ ['--i' as string]: i }}>
              <span className="vtl-node" key={s.state}><StepIcon state={s.state} /></span>
              <div className="vtl-body">
                <div className="vtl-title">
                  <strong>{s.title}</strong>
                  <span className={`vtl-state st-${s.state}`}>{STATE_TEXT[s.state]}</span>
                </div>
                {(s.detail || showEv) && s.state !== 'waiting' && (
                  <p className="vtl-detail">{s.detail ?? ev?.result}</p>
                )}
                {showEv && (
                  <p className="vtl-meta"><code>{ev.tool}</code> <span>{ev.durationMs} ms</span></p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
