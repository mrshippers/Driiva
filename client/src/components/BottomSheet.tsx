import { X, AlertTriangle, Camera, FileText, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BottomSheet({ isOpen, onClose }: BottomSheetProps) {
  const [incidentType, setIncidentType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState("");
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const reportIncidentMutation = useMutation({
    mutationFn: async (incidentData: any) => {
      return apiRequest("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incidentData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Incident Reported",
        description: "Your incident has been submitted successfully",
      });
      onClose();
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
    },
    onError: (error: Error) => {
      console.error("Incident submission error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit incident report",
        variant: "destructive",
      });
    }
  });

  const resetForm = () => {
    setIncidentType("");
    setDescription("");
    setLocation("");
    setSeverity("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!incidentType || !description || !severity) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const incidentData = {
      userId: user?.id ?? 0,
      type: incidentType,
      description: description.trim(),
      location: location.trim() || undefined,
      severity,
      status: "pending"
    };

    console.log("Submitting incident:", incidentData);
    reportIncidentMutation.mutate(incidentData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Bottom Sheet */}
      <div className="relative w-full bg-gradient-to-b from-gray-900/95 to-black/95 backdrop-blur-lg rounded-t-3xl p-6 animate-slide-up max-h-[80vh] overflow-y-auto">
        {/* Handle */}
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Report Incident</h2>
              <p className="text-sm text-gray-400">Submit a FNOL claim or incident report</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-gray-700/50 rounded-full flex items-center justify-center hover:bg-gray-600/50 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Incident Type */}
          <div>
            <Label htmlFor="incident-type" className="text-white mb-2 block">
              Incident Type *
            </Label>
            <Select value={incidentType} onValueChange={setIncidentType}>
              <SelectTrigger className="glass-card border-gray-600 text-white">
                <SelectValue placeholder="Select incident type" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="collision">Traffic Collision</SelectItem>
                <SelectItem value="theft">Vehicle Theft</SelectItem>
                <SelectItem value="vandalism">Vandalism</SelectItem>
                <SelectItem value="weather">Weather Damage</SelectItem>
                <SelectItem value="mechanical">Mechanical Breakdown</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Severity */}
          <div>
            <Label htmlFor="severity" className="text-white mb-2 block">
              Severity *
            </Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="glass-card border-gray-600 text-white">
                <SelectValue placeholder="Select severity level" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="location" className="text-white mb-2 block">
              Location
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where did this occur?"
              className="glass-card border-gray-600 text-white placeholder-gray-400"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-white mb-2 block">
              Description *
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe what happened in detail..."
              rows={4}
              className="glass-card border-gray-600 text-white placeholder-gray-400 resize-none"
            />
          </div>

          {/* Photo Upload (Placeholder) */}
          <div className="glass-card rounded-2xl p-4 border border-dashed border-gray-600">
            <div className="text-center">
              <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400 mb-2">Add Photos (Optional)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="glass-card border-gray-600 text-gray-300 hover:bg-white/10"
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={reportIncidentMutation.isPending}
              className="w-full h-12 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-2xl"
            >
              {reportIncidentMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Report
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Legal Notice */}
        <div className="mt-6 p-4 glass-card rounded-2xl">
          <div className="flex items-start space-x-3">
            <FileText className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Legal Notice</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                By submitting this report, you confirm that the information provided is accurate and complete. 
                False claims may result in policy cancellation and legal action.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}