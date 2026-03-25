/**
 * PRIVACY POLICY
 * ==============
 * UK GDPR–compliant privacy policy for Driiva telematics insurance.
 * Last updated: March 2026
 */

import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="mb-6">
    <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
    <div className="text-white/80 text-sm leading-relaxed space-y-2">
      {children}
    </div>
  </section>
);

const SubSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="mb-4">
    <h3 className="text-base font-medium text-white/95 mb-1">{title}</h3>
    <div className="text-white/80 text-sm leading-relaxed space-y-1 pl-0">
      {children}
    </div>
  </div>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-white/80 text-sm leading-relaxed">{children}</p>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc list-inside text-white/80 text-sm space-y-1 mb-2">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 pb-16 text-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full"
      >
        <div className="flex items-center justify-end mb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-teal-400 hover:text-teal-300 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-white/60 text-xs mb-6">
          Effective: March 2026 · Driiva Ltd (UK)
        </p>

        <div className="backdrop-blur-xl bg-[#1a1a2e]/80 border border-white/10 rounded-2xl p-6 text-left">
          <p className="text-white/90 text-sm leading-relaxed mb-6">
            <strong>Your Data, Your Rules: The Driiva Privacy Promise.</strong>{" "}
            At Driiva, we believe your data is as precious as your no-claims
            bonus. We are committed to keeping it safe, secure, and transparent.
            This policy explains what we collect, why, how we protect it, and
            your rights under UK GDPR.
          </p>

          <Section title="1. Who we are">
            <P>
              Driiva (“we”, “us”, “our”) is the data controller for the
              personal data we collect through the Driiva app and related
              services. We are a UK-based telematics insurance platform that
              rewards safe driving with potential refunds from a community pool.
            </P>
          </Section>

          <Section title="2. What data we collect">
            <SubSection title="2.1 Driving and telematics data">
              <List
                items={[
                  "GPS location data during trips (to calculate distance, routes, and context).",
                  "Driving behaviour: speed, braking, acceleration, cornering, and phone usage indicators.",
                  "Trip metadata: start/end times, duration, and derived driving scores.",
                ]}
              />
              <P>
                This data is used to calculate your driving score and
                eligibility for community refunds, and for insurance pricing
                and risk assessment.
              </P>
            </SubSection>
            <SubSection title="2.2 Personal and account data">
              <List
                items={[
                  "Contact details: name, email address, and phone number.",
                  "Account and authentication data (e.g. login credentials).",
                  "Payment details (processed by our payment providers; we do not store full card numbers).",
                ]}
              />
            </SubSection>
            <SubSection title="2.3 Telematics sensor data (passive collection)">
              <P>
                When the app detects a driving trip, we passively collect data
                from your device's GPS, accelerometer, and gyroscope sensors.
                This includes:
              </P>
              <List
                items={[
                  "Speed, braking intensity, and acceleration patterns.",
                  "Cornering behaviour and heading changes.",
                  "Phone usage indicators (device motion during driving).",
                  "GPS coordinates and timestamps for route reconstruction.",
                ]}
              />
              <P>
                This data is used solely to calculate your driving safety score
                for insurance pricing and community pool eligibility. Raw
                telemetry data is retained on a rolling 12-month basis;
                aggregated scores are retained per our policy retention schedule
                (Section 7).
              </P>
            </SubSection>
            <SubSection title="2.4 In-app feedback">
              <P>
                You may voluntarily submit feedback (star ratings and freetext
                comments) through the app. This data is stored securely and used
                solely for product improvement. Feedback is never shared with
                third parties, sold, or used in any way to influence your
                insurance pricing or driving score.
              </P>
            </SubSection>
            <SubSection title="2.5 Other data">
              <P>
                We may collect device type, app version, and usage information
                to operate and improve the service. We do not sell your personal
                data to third parties.
              </P>
            </SubSection>
          </Section>

          <Section title="3. How we use your data">
            <P>We use your data to:</P>
            <List
              items={[
                "Reward safe driving with potential refunds (from the community pool).",
                "Calculate your driving score and explain how it affects your premium and refunds.",
                "Price and administer your insurance and handle claims.",
                "Screen drivers at onboarding (unsafe habits may result in higher premiums or declined coverage).",
                "Comply with legal and regulatory obligations (e.g. FCA, ICO).",
              ]}
            />
          </Section>

          <Section title="4. Lawful basis for processing (UK GDPR)">
            <SubSection title="4.1 Contract">
              <P>
                Processing necessary to perform our contract with you: providing
                the app, calculating scores, administering the community pool and
                refunds, and managing your policy and claims.
              </P>
            </SubSection>
            <SubSection title="4.2 Legitimate interests">
              <P>
                We process telematics and driving data for our legitimate
                interests in pricing risk, preventing fraud, improving our
                scoring models, and ensuring fair and safe use of the community
                pool, where this is not overridden by your rights.
              </P>
            </SubSection>
            <SubSection title="4.3 Legal obligation">
              <P>
                Where required by law (e.g. regulatory reporting, responding
                to lawful requests).
              </P>
            </SubSection>
          </Section>

          <Section title="5. Third parties and international transfers">
            <P>We use the following categories of processors:</P>
            <SubSection title="5.1 Firebase (Google Cloud)">
              <P>
                We use Google Firebase (and Google Cloud) for authentication,
                database (Firestore), and cloud functions. Data may be
                processed in the USA. We rely on UK adequacy decisions or
                appropriate safeguards (e.g. Standard Contractual Clauses) where
                required for transfers outside the UK.
              </P>
            </SubSection>
            <SubSection title="5.2 Root Insurance Platform">
              <P>
                Where applicable, we integrate with or use the Root Insurance
                platform for insurance operations. Root's infrastructure incorporates
                ISO 27001–compliant data centres. Data shared with Root is subject
                to their privacy policy and our agreements with them.
              </P>
            </SubSection>
            <SubSection title="5.3 Damoov (Driving Behaviour Analytics)">
              <P>
                Driving behaviour data (GPS telemetry, speed, braking,
                acceleration, cornering, and phone usage indicators) is
                transmitted to and processed by Damoov, an EU-based telematics
                data processor acting on Driiva's behalf under a GDPR Article 28
                data processing agreement.
              </P>
              <P>
                Damoov processes this data solely to provide driving analytics
                that feed into your safety score. Damoov does not use your data
                for any purpose other than those specified by Driiva. You can
                review Damoov's privacy policy at{" "}
                <a
                  href="https://www.damoov.com/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:underline"
                >
                  damoov.com/privacy-policy
                </a>
                .
              </P>
              <P>
                You have the right to request deletion of any data held by
                Damoov on your behalf. To exercise this right, contact us at{" "}
                <a
                  href="mailto:info@driiva.co.uk"
                  className="text-teal-400 hover:underline"
                >
                  info@driiva.co.uk
                </a>{" "}
                and we will action the request with Damoov within 30 days.
              </P>
            </SubSection>
            <SubSection title="5.4 Anthropic (AI Analysis)">
              <P>
                Trip data may be analysed by Anthropic's Claude AI service to
                generate driving insights and coaching feedback. Data is sent
                via server-side API calls and is not retained by Anthropic
                beyond the request lifecycle per their data processing terms.
                This feature is optional and controlled by a feature flag.
              </P>
            </SubSection>
            <SubSection title="5.5 Stripe (Payment Processing)">
              <P>
                Premium payments are processed by Stripe, Inc., a PCI DSS
                Level 1 certified payment processor. Driiva does not store
                your full card details. Stripe's privacy policy is available at{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:underline"
                >
                  stripe.com/privacy
                </a>
                .
              </P>
            </SubSection>
            <SubSection title="5.6 Vercel (Hosting)">
              <P>
                Our web application and API are hosted on Vercel's edge
                network. Vercel processes request metadata (IP addresses,
                headers) as part of serving the application. Vercel's privacy
                policy is available at{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:underline"
                >
                  vercel.com/legal/privacy-policy
                </a>
                .
              </P>
            </SubSection>
            <SubSection title="5.7 Sentry (Error Monitoring)">
              <P>
                We use Sentry for application error monitoring to maintain
                service reliability. Sentry may receive technical error data
                including anonymised request metadata. Personal identifiers are
                scrubbed before transmission. Sentry's privacy policy is
                available at{" "}
                <a
                  href="https://sentry.io/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:underline"
                >
                  sentry.io/privacy
                </a>
                .
              </P>
            </SubSection>
            <SubSection title="5.8 Others">
              <P>
                We may use additional support tools and service providers.
                All processors are bound by contract to use data only for the
                purposes we specify and to protect it appropriately.
              </P>
            </SubSection>
          </Section>

          <Section title="6. How we protect your data">
            <List
              items={[
                "Your data is encrypted in transit and at rest.",
                "Access is restricted to authorised personnel and systems (no unauthorised “joyriders”).",
                "We follow industry standards and our Compliance Policy Framework, including regular risk assessments and training.",
              ]}
            />
            <P>
              In the event of a data breach that risks your rights, we will
              notify the ICO within 72 hours where required and inform you in
              plain language without undue delay.
            </P>
          </Section>

          <Section title="7. Data retention">
            <List
              items={[
                "Trip and driving data: retained for the duration of your policy and for 7 years after the end of the policy or as required by law (e.g. claims, regulatory).",
                "Customer and claims data: 7 years post–policy end or as required by law.",
                "Account data: until you delete your account or request erasure, subject to legal retention (e.g. 7 years where applicable).",
                "Marketing and consent-based data: until you withdraw consent or opt out.",
              ]}
            />
          </Section>

          <Section title="8. Your rights (UK GDPR)">
            <P>You have the right to:</P>
            <List
              items={[
                "Access: request a copy of your personal data, including all telematics records and driving scores (no red tape, no hassle).",
                "Rectification: have inaccurate data corrected.",
                "Erasure: request deletion of all data including telematics records (“Delete Account” in the app – and we will remove it subject to legal retention). This includes data held by our processors such as Damoov.",
                "Portability: receive your data (including trip history and scores) in a portable, machine-readable format.",
                "Restrict processing or object to certain processing where the law allows.",
                "Withdraw consent where processing is based on consent (e.g. marketing: unsubscribe at any time).",
                "Lodge a complaint with the ICO (ico.org.uk).",
              ]}
            />
            <P>
              To exercise these rights, contact us at{" "}
              <a
                href="mailto:info@driiva.co.uk"
                className="text-teal-400 hover:underline"
              >
                info@driiva.co.uk
              </a>
              . We will respond within one month.
            </P>
          </Section>

          <Section title="9. Questions and contact">
            <P>
              For privacy questions or to exercise your rights, email us at{" "}
              <a
                href="mailto:info@driiva.co.uk"
                className="text-teal-400 hover:underline"
              >
                info@driiva.co.uk
              </a>
              .
            </P>
            <P>
              We aren't your normal insurer – we aim to be your co-pilot. And co-pilots don't spill secrets.
            </P>
            <p className="text-white/70 text-xs leading-relaxed italic">
              All demo and sample data shown in the app is randomised – no real user data is used in examples or marketing.
            </p>
          </Section>
        </div>
      </motion.div>
    </div>
  );
}
