import { Injectable, ServiceUnavailableException } from "@nestjs/common";

/** Provider boundary: replace with a reviewed transactional delivery adapter.
 * No production secret response or pretend successful email delivery. */
@Injectable()
export class InvitationDelivery {
  assertAvailable() {
    if (!["development", "test"].includes(process.env.NODE_ENV ?? ""))
      throw new ServiceUnavailableException({
        code: "INVITATION_DELIVERY_UNAVAILABLE",
        message: "E-postleverans är inte konfigurerad för denna miljö."
      });
  }
  async deliver(message: { email: string; token: string }) {
    this.assertAvailable();
    const origin = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000").origin;
    // Fragment avoids placing invitation secrets in server/access/referrer URL logs.
    return { developmentInvitationUrl: `${origin}/invitations/accept#${message.token}` };
  }
}
