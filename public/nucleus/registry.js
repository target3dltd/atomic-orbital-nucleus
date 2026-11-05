/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Nucleus registry: everything that orbits the Nucleus.
   To add a tool: put its files in /public/tools/<id>/ (or /public/projects/<id>/), then add or edit
   an entry below. status: "live" opens it, "awaiting" shows it greyed with a note.
   orbit: "tools" (inner ring), "marketing" (shares the inner ring), "projects" (middle ring),
   "systems" (outer ring, opens in a new tab). An orbit's "ring" says which ring of the atom it sits on. */
window.NUCLEUS_REGISTRY = {
  orbits: [
    { id: "tools",    name: "Tools",              blurb: "Built in-house, running on your Pipedrive sign-in" },
    { id: "marketing", name: "Marketing",         blurb: "Brand assets, templates and press materials", ring: "tools" },
    { id: "projects", name: "Project sites",      blurb: "Dedicated hubs for our largest projects" },
    { id: "systems",  name: "Connected systems",  blurb: "The platforms the Nucleus talks to" }
  ],
  items: [
    { id: "process-map", orbit: "tools", icon: "flow", status: "live", name: "Operations processes",
      href: "/tools/process-map/", tags: ["Operations", "Process"],
      desc: "The deal-to-project process map: five phases, the rules, naming and IDs, and which tools are used at each step.",
      links: [{ label: "Checklists & templates", href: "/launch.html?t=checklists", internal: true }, { label: "Operations site (Google)", href: "https://sites.google.com/target3d.co.uk/operations" }] },
    { id: "checklists", orbit: "tools", icon: "check", status: "live", name: "Checklists & templates",
      href: "/tools/checklists/", tags: ["Operations", "Templates"],
      desc: "The 19 operations checklists, reports and templates, from enquiry qualification to install sign-off and support, grouped by process phase." },
    { id: "system-designer", orbit: "tools", icon: "cube", status: "live", name: "System Designer",
      href: "/tools/system-designer/", tags: ["Sales", "Engineering", "Pipedrive"],
      desc: "Design camera volumes in 3D, build the kit list and quote, run site visits and push kit lists, notes and PDFs to Pipedrive deals." },
    { id: "sow-builder", orbit: "tools", icon: "doc", status: "live", name: "SOW Builder",
      href: "/tools/sow-builder/", tags: ["Studio", "Proposals"],
      desc: "Build a Statement of Work for StudioT3D projects: deliverables, milestones, pricing, terms and e-signature, with optional AI assist." },
    { id: "duplicate-eraser", orbit: "tools", icon: "merge", status: "live", name: "Pipedrive Duplicate Eraser",
      href: "/tools/duplicate-eraser/", tags: ["CRM", "Pipedrive", "Data quality"],
      desc: "The Account Merge Desk: find duplicate organisations (universities and their departments especially), preview, merge and undo. Decisions are shared across the team." },
    { id: "motive", orbit: "tools", icon: "key", status: "live", name: "Motive licence renewals",
      href: "/tools/motive/", tags: ["Sales", "Renewals", "Pipedrive"],
      desc: "The Motive Upgrade Planner: every serial and licence, maintenance end dates, campaign stages and owners, and deals or leads straight into Pipedrive." },
    { id: "mocap-toolkit", orbit: "tools", icon: "motion", status: "live", name: "Mocap Toolkit",
      href: "/tools/mocap-toolkit/", tags: ["Review", "Biomechanics", "Animation"],
      desc: "Review and clean motion capture files, retarget and export, run gait, bike-fit, lifting and golf-swing analysis, and stream live capture. Files stay on your computer." },
    { id: "sales-dashboard", orbit: "tools", icon: "chart", status: "live", name: "Sales dashboard",
      href: "/tools/team-dashboards/sales.html", tags: ["Sales", "Pipedrive"],
      desc: "Revenue scoreboard against the FY plan, the weekly pulse, and every open deal triaged hot, warm, stale or dead." },
    { id: "team-performance", orbit: "tools", icon: "gauge", status: "live", name: "Team performance",
      href: "/tools/team-dashboards/", tags: ["Company", "KPIs", "Plan"],
      desc: "Company position against the plan, performance by line, your own KPIs for the monthly meeting, and the 28 plan milestones. Performance Hub for administrators." },
    { id: "support-dashboard", orbit: "tools", icon: "support", status: "live", name: "Support dashboard",
      href: "/tools/support-dashboard/", tags: ["Support", "Pipedrive", "Gmail"],
      desc: "The live replacement for the Freshdesk overview: the Pipedrive Support pipeline by stage and age, who owes a reply, and the support@ inbox." },

    { id: "press-kit", orbit: "marketing", icon: "megaphone", status: "live", name: "Assets & Press Kit",
      href: "/tools/press-kit/", tags: ["Marketing", "Brand", "Press"],
      desc: "Logos for every background, colours, fonts, letterheads, the 2026 brand style guide and ready-to-paste press copy and company details." },

    { id: "clays", orbit: "projects", icon: "pin", status: "live", name: "Clays",
      href: "/projects/clays/", tags: ["Project"], desc: "The Clays project repository: documents, systems and site detail in one place." },
    { id: "drift", orbit: "projects", icon: "pin", status: "live", name: "Drift",
      href: "/projects/drift/", tags: ["Project"], desc: "Murmuring Minds by Studio DRIFT: the robot-swarm artwork tracked by an overhead OptiTrack grid. Every build and plan, the kit, settings and procedures." },
    { id: "lle", orbit: "projects", icon: "pin", status: "live", name: "Little Lion",
      href: "/projects/lle/", tags: ["Project", "OptiTrack"], desc: "Little Lion's Arcade Arena: the three OptiTrack arenas and the R&D test system, with cameras by serial, licences, settings, procedures and open issues." },

    { id: "pipedrive", orbit: "systems", icon: "funnel", status: "external", name: "Pipedrive",
      href: "https://target3d2.pipedrive.com/", tags: ["CRM"], desc: "Deals, leads, organisations and projects. Your API token here is your key to the Nucleus." },
    { id: "quickbooks", orbit: "systems", icon: "ledger", status: "external", name: "QuickBooks",
      href: "https://qbo.intuit.com/", tags: ["Finance"], desc: "Invoices, estimates and accounts." },
    { id: "drive", orbit: "systems", icon: "folder", status: "external", name: "Google Drive",
      href: "https://drive.google.com/", tags: ["Files"], desc: "Shared drives, proposals and project files." },
    { id: "gmail", orbit: "systems", icon: "mail", status: "external", name: "Gmail",
      href: "https://mail.google.com/", tags: ["Email"], desc: "Team email." },
    { id: "ops-site", orbit: "systems", icon: "globe", status: "external", name: "Operations site",
      href: "https://sites.google.com/target3d.co.uk/operations", tags: ["Google Sites"], desc: "The existing Google Sites operations hub." },
    { id: "netlify", orbit: "systems", icon: "cloud", status: "external", name: "Netlify",
      href: "https://app.netlify.com/", tags: ["Hosting"], desc: "Where the Nucleus and its tools are hosted." },
    { id: "claude", orbit: "systems", icon: "spark", status: "external", name: "Claude",
      href: "https://claude.ai/", tags: ["AI"], desc: "Where new tools for the Nucleus are drafted." }
  ]
};
