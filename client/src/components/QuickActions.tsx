import { AlertTriangle, FileText, MessageCircle, Download } from "lucide-react";
import { Link } from "wouter";

interface QuickActionsProps {
  onReportIncident: () => void;
}

export default function QuickActions({ onReportIncident }: QuickActionsProps) {
  const actions = [
    {
      icon: AlertTriangle,
      title: "Report Incident",
      description: "FNOL & Claims",
      color: "bg-[#EF4444] bg-opacity-20",
      iconColor: "text-[#EF4444]",
      onClick: onReportIncident
    },
    {
      icon: FileText,
      title: "Documents",
      description: "Policy & Certificates",
      color: "bg-[#3B82F6] bg-opacity-20",
      iconColor: "text-[#3B82F6]",
      onClick: () => window.open('/documents', '_blank'),
      href: "/profile"
    },
    {
      icon: MessageCircle,
      title: "Support",
      description: "Chat & Help",
      color: "bg-[#A855F7] bg-opacity-20",
      iconColor: "text-[#A855F7]",
      onClick: () => window.open('mailto:info@driiva.co.uk', '_blank'),
      href: "/profile"
    },
    {
      icon: Download,
      title: "Export Data",
      description: "GDPR Compliance",
      color: "bg-[#06B6D4] bg-opacity-20",
      iconColor: "text-[#06B6D4]",
      onClick: () => window.location.href = '/api/gdpr/export/2',
      href: "/profile"
    }
  ];

  return (
    <section className="mb-6">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      
      <div className="grid grid-cols-2 gap-4">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className="glass-morphism rounded-2xl p-4 text-left haptic-button spring-transition hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 ${action.color} rounded-xl flex items-center justify-center`}>
                <action.icon className={`w-5 h-5 ${action.iconColor}`} />
              </div>
              <div>
                <div className="font-medium text-white">{action.title}</div>
                <div className="text-xs text-gray-400">{action.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
