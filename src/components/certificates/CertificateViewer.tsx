import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { CertificatePDF } from './CertificatePDF';
import type { Certificate } from '@/types/certificates';

interface CertificateViewerProps {
  certificate: Certificate;
  isOpen: boolean;
  onClose: () => void;
  brandingCityId?: string | null;
}

export function CertificateViewer({ certificate, isOpen, onClose, brandingCityId }: CertificateViewerProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Certificado - {certificate.student_name}</span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <CertificatePDF certificate={certificate} brandingCityId={brandingCityId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

