import { useReveal } from '@/hooks/useReveal';

interface Q {
  q: string;
  a: string;
}

/**
 * The single source for the FAQ, rendered here and serialised into the
 * FAQPage JSON-LD by scripts/prerender.mjs.
 *
 * These answers used to exist twice: here, and hand-typed into a
 * <script type="application/ld+json"> block in index.html. The two drifted.
 * The visible answer gave the agreed position, that we are only working
 * towards the sandbox and are not authorised. The schema, which is the copy a
 * search engine reads, asserted a submitted application awaiting a decision.
 * Nothing has been submitted. That was a false regulatory claim served to
 * search engines for as long as the two copies were maintained separately.
 * Now there is one copy, and it is this one.
 */
export const QS: readonly Q[] = [
  {
    q: 'Will this really be cheaper than my current insurance?',
    a: "That is the intention, and we are not going to put a number on it before we have priced a single real policy. The model rewards safe driving and charges aggressive driving accordingly, so if you drive hard, we are deliberately not for you.",
  },
  {
    q: 'What counts as a "safe" trip?',
    a: 'We score five factors: smooth acceleration, gentle braking, calm cornering, speed discipline, and phone-free driving. Every factor is weighted and published in the app in real time. You see the score change as you drive.',
  },
  {
    q: 'What happens if I have an accident?',
    a: 'Nothing yet, because we cannot sell you a policy until the FCA authorises us. When we can, claims handling and score refunds will be separate: a claim is settled under the policy, and refunds depend on how the pool performs. Until then this is a waitlist and you are insured by whoever you are with today.',
  },
  {
    q: 'Is this legal? Are you FCA-regulated?',
    a: 'Not yet. We are working towards the FCA regulatory sandbox, we are not authorised, and we are not operating under an MGA. We cannot sell policies today, which is why this is a waitlist and not a checkout.',
  },
  {
    q: 'Do I need to install a dashcam or OBD dongle?',
    a: 'No. Your phone does everything. No hardware to buy, install, or forget to plug back in.',
  },
] as const;

export function FAQ() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id="faq" data-section="faq">
      <div className="container">
        <div className="section-head reveal-init">
          <span className="eyebrow-mini">Questions, answered</span>
          <h2>You asked. We answered.</h2>
        </div>
        <div className="faq-list reveal-init">
          {QS.map((qa, i) => (
            <details key={i} className="glass faq" data-testid={`faq-${i + 1}`}>
              <summary>
                {qa.q}
                <svg
                  className="chev"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="faq-body">{qa.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
