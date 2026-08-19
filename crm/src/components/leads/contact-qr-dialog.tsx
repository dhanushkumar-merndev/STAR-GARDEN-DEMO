'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Desktop has no dialler or WhatsApp app to hand a `tel:`/`wa.me` link to, so
 * the button that would otherwise just navigate the browser opens this
 * instead: a QR code rendered entirely client-side as an SVG — never sent to
 * a third-party QR API, since the code encodes a customer's phone number
 * (§15) — that staff scan with their own phone to continue there. The link
 * itself is still offered directly too, in case this desktop has something
 * registered to handle it (WhatsApp Desktop, Skype, a SIP client).
 */
export function ContactQrDialog({
  open,
  onOpenChange,
  title,
  description,
  href,
  linkLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex size-64 items-center justify-center rounded-xl border border-line bg-white p-3">
            <QRCodeSVG value={href} size={232} marginSize={2} />
          </div>
          <p className="text-center text-sm text-ink-muted">Scan with your phone to continue there.</p>
          <a
            href={href}
            target={href.startsWith('tel:') ? undefined : '_blank'}
            rel={href.startsWith('tel:') ? undefined : 'noopener noreferrer'}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-brand-600 px-5 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            {linkLabel}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
