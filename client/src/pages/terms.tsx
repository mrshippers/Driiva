/**
 * TERMS OF SERVICE
 * ================
 * Concise terms for Driiva telematics insurance (UK).
 * Last updated: March 2026
 */

import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { FinancialPromotionDisclaimer } from "@/components/FinancialPromotionDisclaimer";

export default function Terms() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-4 pt-safe pt-6 pb-24 text-white">
        {/* Header - fixed at top */}
        <div className="flex items-center justify-end mb-6">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-teal-400 hover:text-teal-300 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <h1 className="text-2xl font-bold mb-1">Terms of Service (ToS)</h1>
        <p className="text-white/60 text-xs mb-6">Effective: March 2026 · Driiva Ltd (UK)</p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="backdrop-blur-xl bg-[#1a1a2e]/80 border border-white/10 rounded-2xl p-6 text-left"
        >
          <p className="text-white/90 text-sm leading-relaxed mb-6">
            Welcome to Driiva. We're the intelligent car insurance where safe driving can earn you back a portion of your premium – year after year. By using our app, you agree to these terms. Please read them.
          </p>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">Our service</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Driiva offers telematics-based car insurance and a community rewards programme. We use your driving data to calculate a personal score and your share of the community pool. The service is offered in the UK and subject to FCA and Consumer Duty.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">2. How refunds work</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              The pool is funded by premiums and other sources. Qualified drivers may receive a refund based on behaviour and actuarial principles.
            </p>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1 mb-2">
              <li>~80% of your refund comes from your own driving score.</li>
              <li>~20% reflects a community bonus.</li>
              <li>Your personal efforts drive most of your refund.</li>
            </ul>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Our community score averages only drivers who qualify (score 70+). High-risk drivers pay premiums that reflect their risk and help balance the pool. Refunds are capped to ensure sustainability.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              Rewards, cashback, and community pool refunds are community-based behaviour incentives. They do not constitute a guaranteed reduction in your insurance premium, a regulated financial benefit, or a contractual entitlement. Reward eligibility and amounts are determined at Driiva's discretion based on driving behaviour, pool performance, and actuarial sustainability.
            </p>
            <FinancialPromotionDisclaimer className="mt-3" />
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">3. Driving score</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We analyse speed, braking, acceleration, cornering, and phone usage. You get clear feedback on how your driving affects scores and refunds. Unsafe habits may lead to higher premiums or declined coverage.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">4. Your obligations</h2>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Provide accurate information and keep it up to date.</li>
              <li>Use the app and any telematics device lawfully.</li>
              <li>Don't misuse the service or manipulate scores.</li>
              <li>Keep your account credentials secure.</li>
            </ul>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">4a. Telematics data and consent</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              By using the Driiva app, you consent to the passive detection of driving trips and the collection of telematics data from your device's GPS, accelerometer, and gyroscope sensors. This data is processed for the purpose of insurance risk scoring, driving safety analysis, and community pool eligibility.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              Telematics data is transmitted to Driiva and its data processors (including Damoov, acting under a GDPR Article 28 agreement). You may withdraw consent at any time by deleting your account, though this will end your access to the service and any accrued rewards.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">5. Termination</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              You may close your account anytime via the app or by contacting us. We may suspend or terminate if you breach these terms, fail to pay, provide false information, or misuse the app. On termination, your right to use the service and earn refunds ceases. Data retention follows our Privacy Policy.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">6. Liability</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We don't exclude liability for death or personal injury caused by our negligence, or fraud. Otherwise, we're not liable for indirect, consequential, or special loss, or amounts above fees paid in the 12 months before a claim. You use the app and drive at your own risk.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">7. Changes</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We may update these terms. We'll notify you of material changes. Continued use after the effective date constitutes acceptance where the law allows.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">8. General</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Governed by the laws of England and Wales. Courts of England and Wales have exclusive jurisdiction, unless you're a consumer elsewhere in the UK.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">9. Insurance underwriter</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Driiva is not the insurer. Insurance policies are underwritten by {import.meta.env.VITE_UNDERWRITER_NAME || '[Underwriter to be confirmed — sandbox mode]'}. The underwriter is authorised and regulated by the Financial Conduct Authority.
            </p>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Driiva acts as a managing general agent (MGA) facilitating the distribution of insurance products. {import.meta.env.VITE_FCA_REGISTRATION_NUMBER ? `Our FCA registration number is ${import.meta.env.VITE_FCA_REGISTRATION_NUMBER}.` : 'FCA authorisation is pending.'}
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">10. Cancellation and cooling-off</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              You have a 14-day cooling-off period from the start date of your policy during which you may cancel and receive a full refund of any premium paid, less a proportionate charge for any days of cover provided. After the cooling-off period, you may still cancel at any time but charges may apply. See your policy document for full cancellation terms.
            </p>
          </section>

          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">11. Complaints</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              If you are unhappy with our service, please contact us at{" "}
              <a href="mailto:complaints@driiva.co.uk" className="text-teal-400 hover:underline">complaints@driiva.co.uk</a>.
              We will acknowledge your complaint within 5 business days and aim to resolve it within 8 weeks.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              If you remain dissatisfied, you may refer your complaint to the Financial Ombudsman Service (FOS) at{" "}
              <a href="https://www.financial-ombudsman.org.uk" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">financial-ombudsman.org.uk</a>{" "}
              or by calling 0800 023 4567.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">12. Contact</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Questions? Contact us at{" "}
              <a href="mailto:info@driiva.co.uk" className="text-teal-400 hover:underline">
                info@driiva.co.uk
              </a>
              . For full policy terms, see your policy document.
            </p>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
