import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComposeForm } from "@/components/email/ComposeForm";

export function ComposeModal({ open, onOpenChange, onScheduled }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        data-testid="compose-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">New Message</DialogTitle>
          <DialogDescription>
            Compose and schedule a paced campaign. Emails are sent gradually using delayed
            background jobs.
          </DialogDescription>
        </DialogHeader>
        <ComposeForm
          onCancel={() => onOpenChange(false)}
          onSuccess={(result) => {
            onOpenChange(false);
            onScheduled?.(result);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
