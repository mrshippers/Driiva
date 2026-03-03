import { useLocation } from "wouter";
import { ArrowLeft, MessageCircle, Mail, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

export default function Support() {
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const supportOptions = [
    {
      icon: MessageCircle,
      title: "Chat with us",
      description: "Coming soon, we promise!",
      color: "#10B981",
      href: null
    },
    {
      icon: Mail,
      title: "Email us",
      description: "Interested in Driiva? Got a question? We'll respond as soon as possible",
      color: "#F59E0B",
      href: "mailto:info@driiva.co.uk?subject=Say%20Hi%3F"
    }
  ];

  const faqItems = [
    {
      id: "score",
      question: "How is my driving score calculated?",
      answer: "Your score is based on acceleration, braking, speed adherence, and night driving patterns."
    },
    {
      id: "refund",
      question: "When will I receive my refund?",
      answer: "We currently aim to pay back eligible Driiva members at/just before policy renewal. Yes, we said pay back."
    },
    {
      id: "improve",
      question: "Can I improve my driving score?",
      answer: "Yes! That's where the AI power comes in – receive personalised coaching analysis to improve your driving."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col pt-safe">
      <div className="max-w-md mx-auto px-4 py-6 pb-24 text-white flex-1">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">Support</h1>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Get in Touch</h2>
          <div className="space-y-4">
            {supportOptions.map((option, index) => {
              const content = (
                <>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${option.color}20` }}
                  >
                    <option.icon className="w-5 h-5" style={{ color: option.color }} />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{option.title}</h3>
                    <p className="text-sm text-white/50">{option.description}</p>
                  </div>
                </>
              );
              return option.href ? (
                <a
                  key={index}
                  href={option.href}
                  className="dashboard-glass-card p-4 flex items-center gap-3 block hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {content}
                </a>
              ) : (
                <div key={index} className="dashboard-glass-card p-4 flex items-center gap-3">
                  {content}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {faqItems.map((item) => (
              <Collapsible
                key={item.id}
                open={openFaq === item.id}
                onOpenChange={(open) => setOpenFaq(open ? item.id : null)}
              >
                <div className="dashboard-glass-card overflow-hidden">
                  <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/5 transition-colors">
                    <span className="font-medium text-white">{item.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 flex-shrink-0 text-white/50 transition-transform duration-200 ${
                        openFaq === item.id ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-0">
                      <p className="text-sm text-white/50">{item.answer}</p>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </div>
      </div>

      {/* Footer - match Welcome page */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 pb-safe border-0 border-none shadow-none outline-none bg-transparent">
        <div className="relative flex items-center justify-center py-2.5 px-4">
          <span
            className="absolute right-3 bottom-1 text-white/35 text-[10px] italic"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            driiva © 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
