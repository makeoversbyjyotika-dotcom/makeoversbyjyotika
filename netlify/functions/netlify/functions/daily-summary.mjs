// This runs automatically once a day (9:00 PM IST) — no manual trigger needed.
// It reads today's form submissions, totals them per client, and emails you the summary.

export default async () => {
  const NETLIFY_TOKEN = process.env.NETLIFY_API_TOKEN;
  const SITE_ID = process.env.NETLIFY_SITE_ID;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL = process.env.SUMMARY_EMAIL || "makeoversbyjyotika@gmail.com";
  const FORM_NAME = "lead-capture";

  try {
    // 1. Find the form's ID on this site
    const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/forms`, {
      headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` }
    });
    const forms = await formsRes.json();
    const form = forms.find(f => f.name === FORM_NAME);
    if (!form) {
      console.error("Form not found:", FORM_NAME);
      return new Response("Form not found", { status: 404 });
    }

    // 2. Get all submissions for that form
    const subsRes = await fetch(`https://api.netlify.com/api/v1/forms/${form.id}/submissions`, {
      headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` }
    });
    const submissions = await subsRes.json();

    // 3. Keep only today's submissions (using IST, India time)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const todayStr = nowIST.toISOString().slice(0, 10);

    const todays = submissions.filter(s => {
      const createdIST = new Date(new Date(s.created_at).getTime() + IST_OFFSET_MS);
      return createdIST.toISOString().slice(0, 10) === todayStr;
    });

    // 4. Group by client (name + phone), count makeup vs hair-only
    const clients = {};
    let totalMakeup = 0;
    let totalHair = 0;

    todays.forEach(s => {
      const data = s.data || {};
      const name = (data.name || "Unknown").trim();
      const phone = (data.phone || "").trim();
      const visit = (data.visit || "").trim();
      const key = name.toLowerCase() + "|" + phone;

      if (!clients[key]) {
        clients[key] = { name, phone, makeup: 0, hair: 0 };
      }

      if (/hair only/i.test(visit)) {
        clients[key].hair += 1;
        totalHair += 1;
      } else if (/makeup/i.test(visit)) {
        clients[key].makeup += 1;
        totalMakeup += 1;
      }
    });

    // 5. Build the summary text
    const lines = Object.values(clients).map(c => {
      const parts = [];
      if (c.makeup) parts.push(`${c.makeup} Makeup${c.makeup > 1 ? "s" : ""}`);
      if (c.hair) parts.push(`${c.hair} Hair Only`);
      return `${c.name} — ${c.phone} — ${parts.join(" + ")}`;
    });

    const summaryText =
      `Today's Totals — Makeovers by Jyotika (${todayStr})\n\n` +
      (lines.length ? lines.join("\n") : "No submissions today.") +
      `\n\nTotal Makeups Today: ${totalMakeup}\nTotal Hair Only Today: ${totalHair}`;

    // 6. Email the summary
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Makeovers by Jyotika <onboarding@resend.dev>",
        to: [TO_EMAIL],
        subject: `Daily Summary — ${todayStr}`,
        text: summaryText
      })
    });

    return new Response("OK");
  } catch (err) {
    console.error("Daily summary error:", err);
    return new Response("Error: " + err.message, { status: 500 });
  }
};

export const config = {
  schedule: "0 18 * * *" // 11:30 PM IST (India time) every day
};
