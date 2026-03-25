/**
 * INSURANCE PRODUCT INFORMATION DOCUMENT (IPID)
 * ==============================================
 * UK IDD-compliant IPID for Driiva telematics motor insurance.
 * Last updated: March 2026
 */

import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function IPID() {
  const [, setLocation] = useLocation();

  const underwriterName =
    import.meta.env.VITE_UNDERWRITER_NAME ||
    "Underwriter to be confirmed — sandbox mode";

  const fcaNumber = import.meta.env.VITE_FCA_REGISTRATION_NUMBER;

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

        <h1 className="text-2xl font-bold mb-1">Insurance Product Information Document (IPID)</h1>
        <p className="text-white/60 text-xs mb-6">
          Effective: March 2026 · Driiva Ltd (UK) · Underwritten by {underwriterName}
        </p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="backdrop-blur-xl bg-[#1a1a2e]/80 border border-white/10 rounded-2xl p-6 text-left"
        >
          <p className="text-white/90 text-sm leading-relaxed mb-6">
            This document provides a summary of the key information relating to this motor insurance product. Complete pre-contractual and contractual information is provided in the full policy documentation. This IPID is prepared in accordance with the Insurance Distribution Directive (IDD).
          </p>

          {/* 1. What type of insurance is this? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">What type of insurance is this?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              This is a private motor insurance policy. It is a telematics-based product that uses driving behaviour data collected via the Driiva app to personalise your premium and calculate your driving score.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              Qualifying drivers may receive a share of the Driiva community reward pool — a cash refund based on safe driving behaviour. The reward pool is actuarially capped and is not a guaranteed benefit.
            </p>
          </section>

          {/* 2. Who is the insurer? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">Who is the insurer?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Your insurance policy is underwritten by{" "}
              <strong className="text-white">{underwriterName}</strong>. The underwriter is authorised and regulated by the Financial Conduct Authority (FCA).
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              Driiva Ltd acts as a managing general agent (MGA), facilitating the distribution and administration of this insurance product on behalf of the underwriter.
            </p>
          </section>

          {/* 3. What is insured? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">What is insured?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Depending on your chosen level of cover, the policy may include:
            </p>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Third party liability — damage to other people's property and injury to third parties, as required by the Road Traffic Act 1988.</li>
              <li>Fire and theft — loss of or damage to your vehicle caused by fire, lightning, explosion, or theft.</li>
              <li>Accidental damage — loss of or damage to your vehicle caused by accidental means, including collision.</li>
              <li>Personal injury — cover for injuries to you or your passengers resulting from an accident.</li>
              <li>Windscreen cover — repair or replacement of your vehicle's windscreen and windows.</li>
              <li>Breakdown assistance — roadside assistance and recovery services.</li>
            </ul>
          </section>

          {/* 4. What is not insured? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">What is not insured?</h2>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Intentional or deliberate damage caused by you or with your knowledge.</li>
              <li>Loss or damage while the vehicle is being driven by an unlicensed or uninsured driver.</li>
              <li>Use of the vehicle for commercial purposes, hire or reward, unless specifically agreed.</li>
              <li>Loss or damage arising from racing, rallying, pace-making, or speed testing.</li>
              <li>Loss or damage while driving under the influence of alcohol or drugs.</li>
              <li>Wear and tear, depreciation, or gradual deterioration of the vehicle.</li>
              <li>Mechanical or electrical breakdown, failure, or breakage.</li>
            </ul>
          </section>

          {/* 5. Are there any restrictions on cover? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">Are there any restrictions on cover?</h2>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Cover applies within the United Kingdom only, unless an extension has been agreed in writing.</li>
              <li>Only named drivers listed on the policy are covered to drive the insured vehicle.</li>
              <li>The insured vehicle must hold a valid MOT certificate (where applicable) and be roadworthy.</li>
              <li>You must consent to the collection of telematics data via the Driiva app as a condition of cover.</li>
              <li>Minimum age restrictions apply — drivers under the minimum age stated in your policy schedule are not covered.</li>
              <li>An excess may apply to certain claims as specified in your policy schedule.</li>
            </ul>
          </section>

          {/* 6. What are my obligations? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">What are my obligations?</h2>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Provide accurate, complete, and truthful information when applying for and throughout the life of your policy.</li>
              <li>Use the insured vehicle lawfully and in accordance with its intended purpose.</li>
              <li>Report any claims, incidents, or changes in circumstances to us promptly.</li>
              <li>Keep the Driiva app installed and allow telematics data to be collected and shared for scoring and risk assessment.</li>
              <li>Pay your premiums on time in accordance with your payment schedule.</li>
              <li>Take reasonable steps to protect the vehicle from loss or damage.</li>
            </ul>
          </section>

          {/* 7. When and how do I pay? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">When and how do I pay?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Premiums are payable monthly or annually via Stripe, our secure payment processor. Your premium amount is determined by your risk profile, driving history, vehicle details, and telematics data.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              Monthly payments are collected automatically on the same date each month. If a payment fails, we will notify you and attempt to collect again. Continued failure to pay may result in cancellation of your policy.
            </p>
          </section>

          {/* 8. When does the cover start and end? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">When does the cover start and end?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              Cover begins on the start date shown in your policy schedule, once your application has been accepted and your first payment received. The policy runs for an annual period of 12 months from that date.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              You have a statutory 14-day cooling-off period from the start date or the date you receive your policy documents, whichever is later. During this period you may cancel and receive a full refund, less any proportionate charge for days of cover provided.
            </p>
          </section>

          {/* 9. How do I cancel the contract? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">How do I cancel the contract?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              You may cancel your policy at any time via the Driiva app or by emailing{" "}
              <a href="mailto:support@driiva.co.uk" className="text-teal-400 hover:underline">support@driiva.co.uk</a>.
            </p>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Within the 14-day cooling-off period: you will receive a full refund of premiums paid, less a proportionate charge for any days of cover already provided.</li>
              <li>After the cooling-off period: cancellation charges may apply on a pro-rata basis, plus an administration fee as detailed in your policy schedule.</li>
              <li>Any accrued community pool rewards that have not yet been paid out will be forfeited upon cancellation.</li>
            </ul>
          </section>

          {/* 10. How do I make a claim? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">How do I make a claim?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              To make a claim, contact us as soon as possible at{" "}
              <a href="mailto:claims@driiva.co.uk" className="text-teal-400 hover:underline">claims@driiva.co.uk</a>.
            </p>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>Provide your policy number, a description of what happened, and supporting evidence (photos, witness details, police report reference if applicable).</li>
              <li>Cooperate fully with any investigation into your claim.</li>
              <li>Do not admit liability or negotiate with third parties without our written consent.</li>
              <li>Claims must be reported promptly — failure to do so may affect your entitlement.</li>
            </ul>
          </section>

          {/* 11. How do I complain? */}
          <section className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-2">How do I complain?</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              If you are unhappy with any aspect of our service, please contact us at{" "}
              <a href="mailto:complaints@driiva.co.uk" className="text-teal-400 hover:underline">complaints@driiva.co.uk</a>.
              We will acknowledge your complaint within 5 business days and aim to resolve it within 8 weeks.
            </p>
            <p className="text-white/80 text-sm leading-relaxed">
              If you remain dissatisfied after our final response, or if 8 weeks have passed without resolution, you may refer your complaint to the Financial Ombudsman Service (FOS) at{" "}
              <a href="https://www.financial-ombudsman.org.uk" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">financial-ombudsman.org.uk</a>{" "}
              or by calling{" "}
              <a href="tel:08000234567" className="text-teal-400 hover:underline">0800 023 4567</a>.
            </p>
          </section>

          {/* 12. Other important information */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Other important information</h2>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1">
              <li>
                {fcaNumber
                  ? `Driiva Ltd is authorised and regulated by the Financial Conduct Authority. Our FCA registration number is ${fcaNumber}.`
                  : "Driiva Ltd — FCA authorisation is pending. Driiva currently operates under a sandbox arrangement aligned with FCA requirements."}
              </li>
              <li>Your policy may be protected by the Financial Services Compensation Scheme (FSCS). You may be entitled to compensation if the insurer is unable to meet its obligations. Further information is available at{" "}
                <a href="https://www.fscs.org.uk" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">fscs.org.uk</a>.
              </li>
              <li>This policy is governed by the laws of England and Wales. The courts of England and Wales have exclusive jurisdiction, unless you reside elsewhere in the United Kingdom.</li>
              <li>Full policy terms, conditions, and exclusions are set out in your policy booklet and schedule. Please read these documents carefully.</li>
            </ul>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
