import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PolicyDownloadProps {
    userId: number;
    userData?: {
        firstName?: string;
        lastName?: string;
        username: string;
        email: string;
        premiumAmount: string;
        policyNumber?: string | null;
    };
    policyNumber?: string | null;
}

export default function PolicyDownload({ userId, userData, policyNumber }: PolicyDownloadProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();

    const displayPolicyNumber = policyNumber || userData?.policyNumber || "—";

    const generatePolicyPDF = () => {
        const doc = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Driiva Insurance Policy</title>
    <style>
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 40px; color: #1f2937; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; }
        .logo { font-size: 32px; font-weight: bold; color: #3b82f6; font-style: italic; margin-bottom: 10px; }
        .policy-details { margin: 30px 0; }
        .section { margin: 25px 0; }
        .section h3 { color: #3b82f6; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
        .label { font-weight: 600; }
        .value { color: #6b7280; }
        .coverage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .coverage-item { padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #10b981; }
        .terms { font-size: 12px; color: #6b7280; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">Driiva</div>
        <h1>Telematics Insurance Policy</h1>
        <p>AI-Powered Safe Driving Insurance</p>
    </div>

    <div class="policy-details">
        <div class="section">
            <h3>Policy Holder Information</h3>
            <div class="detail-row">
                <span class="label">Name:</span>
                <span class="value">${userData?.firstName || ''} ${userData?.lastName || userData?.username || 'Test Driver'}</span>
            </div>
            <div class="detail-row">
                <span class="label">Email:</span>
                <span class="value">${userData?.email || 'test@driiva.co.uk'}</span>
            </div>
            <div class="detail-row">
                <span class="label">Policy Number:</span>
                <span class="value">${displayPolicyNumber}</span>
            </div>
            <div class="detail-row">
                <span class="label">Policy Start Date:</span>
                <span class="value">July 1, 2025</span>
            </div>
            <div class="detail-row">
                <span class="label">Policy End Date:</span>
                <span class="value">July 1, 2026</span>
            </div>
            <div class="detail-row">
                <span class="label">Annual Premium:</span>
                <span class="value">£${userData?.premiumAmount || '—'}</span>
            </div>
        </div>

        <div class="section">
            <h3>Coverage Details</h3>
            <div class="coverage-grid">
                <div class="coverage-item">
                    <h4>Third Party Liability</h4>
                    <p>Unlimited</p>
                </div>
                <div class="coverage-item">
                    <h4>Fire & Theft</h4>
                    <p>Market Value</p>
                </div>
                <div class="coverage-item">
                    <h4>Accidental Damage</h4>
                    <p>Market Value</p>
                </div>
                <div class="coverage-item">
                    <h4>Personal Injury</h4>
                    <p>£100,000</p>
                </div>
            </div>
        </div>

        <div class="section">
            <h3>Telematics Features</h3>
            <ul>
                <li>Real-time driving behavior monitoring</li>
                <li>AI-powered risk assessment</li>
                <li>Performance-based premium refunds (up to 15%)*</li>
                <li>Community safety pool participation</li>
                <li>24/7 emergency assistance</li>
                <li>Gamified safe driving rewards</li>
            </ul>
        </div>

        <div class="section">
            <h3>Contact Information</h3>
            <div class="detail-row">
                <span class="label">Customer Service:</span>
                <span class="value">0800 123 4567</span>
            </div>
            <div class="detail-row">
                <span class="label">Claims Hotline:</span>
                <span class="value">0800 765 4321</span>
            </div>
            <div class="detail-row">
                <span class="label">Email Support:</span>
                <span class="value">info@driiva.co.uk</span>
            </div>
            <div class="detail-row">
                <span class="label">Website:</span>
                <span class="value">app.driiva.co.uk</span>
            </div>
        </div>
    </div>

    <div class="terms">
        <p><strong>Important:</strong> This policy is subject to terms and conditions. Please refer to your full policy documentation for complete details. Generated on ${new Date().toLocaleDateString()}.</p>
        <p>*Refund projections are illustrative. Actual amounts depend on pool performance, claims experience, and underwriting criteria. Past performance is not a guarantee of future refunds.</p>
        <p>Driiva Ltd. Authorised and regulated by the Financial Conduct Authority. Registration number: DRV123456.</p>
    </div>
</body>
</html>`;

        return doc;
    };

    const handleDownload = async () => {
        setIsGenerating(true);
        try {
            // Generate the HTML content
            const htmlContent = generatePolicyPDF();

            // Create a blob with the HTML content
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = window.URL.createObjectURL(blob);

            // Create download link
            const a = document.createElement('a');
            a.href = url;
            a.download = `driiva-policy-${userData?.username || 'user'}-${Date.now()}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast({
                title: "Policy Downloaded",
                description: "Your comprehensive insurance policy has been downloaded successfully.",
            });
        } catch (error) {
            toast({
                title: "Download Failed",
                description: "There was an error downloading your policy. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Button
            onClick={handleDownload}
            disabled={isGenerating}
            variant="outline"
            className="w-full glass-morphism border-[#3B82F6] text-[#3B82F6] hover:bg-[#3B82F6] hover:text-white"
        >
            <FileText className="w-4 h-4 mr-2" />
            {isGenerating ? 'Generating Policy...' : 'Download My Policy'}
        </Button>
    );
}