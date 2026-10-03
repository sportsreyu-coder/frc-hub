// Season Tracker milestone plan.
//
// Every offset is in days relative to Kickoff day (the first Saturday of
// January). Negative offsets fall before Kickoff (preseason); positive
// offsets fall after it (build season onward). Sourced from:
//  - Build season shape: FIRST's own "Build Season Timeline" handout
//    (firstinspires.org/hubfs/web/program/frc/resources/build-season-timeline-11x17.pdf)
//  - Preseason plan: LearnFRC's week-by-week preseason training plan
//    (learnfrc.com/blog/frc-preseason-training-plan)
//  - Competition/postseason shape: general FRC community practice (awards
//    submissions, sponsor thank-yous, off-season events, recruiting)
//
// This is a recommended pace, not an official requirement -- teams should
// adapt it to their own season plan, including who on the team owns what
// (the `team` tags below are a reasonable default split across design,
// mechanical, electrical, programming, and business/outreach subteams).
//
// Build season (CAD through driver practice) runs noticeably tighter than
// FIRST's own default handout: a first CAD draft is targeted at 2.5 weeks,
// full design release 2 days before fabrication wraps (fab itself held to
// 1 week), assembly runs about 2 weeks, wiring is tracked as its own
// ~1-week milestone right after assembly, programming overlaps the tail
// end of wiring, and driver practice runs the last few days right up to
// the day before the first event.
//
// `label` is the full checklist name. `short` is what's shown on the
// calendar. `detail` is the one-line summary; `expanded` is the longer
// write-up. `subtasks` are {label, team} steps -- they also get plotted
// on the calendar, on the same day as their parent milestone.
window.SEASON_MILESTONES = [
  // ---- Preseason (Sept -> Kickoff) ----
  { id: "ps-roster", phase: "Preseason", offset: -105, team: "business",
    label: "Team roles assigned & registration confirmed",
    short: "Assign Roles",
    detail: "Mechanical, electrical, programming, CAD, and business roles set; Kickoff Kit selection window and event registration confirmed.",
    expanded: "Confirm who is leading mechanical, electrical, programming, CAD, and business/outreach before real training work starts -- ambiguity here is one of the most common reasons preseason plans stall out. Lock in your event registration and payment deadlines, and decide whether you're keeping last year's Kickoff Kit checklist or updating it. If you're attending any fall off-season events, get them on the calendar now so training has a real deadline to build toward.",
    subtasks: [
      { label: "Assign subteam leads", team: "business" },
      { label: "Confirm event registration & payment deadlines", team: "business" },
      { label: "Pick fall events to attend", team: "business" },
    ] },
  { id: "ps-fundamentals", phase: "Preseason", offset: -77, team: "cross-team",
    label: "Driving practice",
    short: "Chassis Drives",
    detail: "Practice/training robot has a working drivetrain a student can drive, with basic wiring and CAN bus in place.",
    expanded: "This is the first real capability checkpoint: a student should be able to pick up a controller and drive the practice chassis around under teleop control. Mechanical should have the drivetrain fabricated and mounted, electrical should have the full power path and CAN bus wired end to end, and programming should have a basic command-based drivetrain subsystem running -- all three tracks working in parallel rather than waiting on each other.",
    subtasks: [
      { label: "Build the practice robot's drivetrain", team: "mechanical" },
      { label: "Wire the practice robot", team: "electrical" },
      { label: "Write basic driving code", team: "programming" },
    ] },
  { id: "ps-auto", phase: "Preseason", offset: -49, team: "programming",
    label: "Autonomous driving test",
    short: "Auto + PID",
    detail: "One scripted autonomous path and one PID-controlled motion running, vision/AprilTag detection mounted if used.",
    expanded: "Push the practice robot past manual driving: get one PID-tuned motion (like turning to an angle or driving a fixed distance) running cleanly, and one scripted autonomous path executing start to finish. If your team uses vision, this is also the checkpoint to get an AprilTag or camera pipeline mounted and returning real data, even if it isn't wired into a full autonomous routine yet.",
    subtasks: [
      { label: "Tune one precise movement (turning or driving a set distance)", team: "programming" },
      { label: "Get one autonomous routine working start to finish", team: "programming" },
      { label: "Set up and test the camera/vision system", team: "programming" },
    ] },
  { id: "ps-offseason-event", phase: "Preseason", offset: -28, team: "business",
    label: "Attend a fall event & test scouting",
    short: "Fall Event",
    detail: "Good checkpoint to test scouting systems live and start drafting your Impact Award narrative while it's fresh.",
    expanded: "A fall off-season event (or even a scrimmage) is the cheapest way to find problems in your scouting system before it actually matters. Run your real scouting app or spreadsheet against live matches, and have your outreach lead start drafting the Impact Award narrative now -- the details are freshest right after an event, not in December when you're trying to reconstruct them.",
    subtasks: [
      { label: "Sign up for and attend a fall event", team: "business" },
      { label: "Test the scouting app during real matches", team: "business" },
      { label: "Start writing the Impact Award essay", team: "business" },
    ] },
  { id: "ps-mock-kickoff", phase: "Preseason", offset: -7, team: "cross-team",
    label: "Practice kickoff & robot check",
    short: "Mock Kickoff",
    detail: "Rehearse strategy discussion under time pressure with an old game manual; confirm teleop, autonomous, and electrical are solid before the real Kickoff.",
    expanded: "Pull an old game manual and run a full mock kickoff: read the rules cold, brainstorm strategy, and present a plan under a tight time limit, the same way you'll have to on the real day. In parallel, do a final pass on the practice robot -- confirm teleop, autonomous, and every electrical connection are solid, since this is the platform new drivers and programmers will lean on once build season starts.",
    subtasks: [
      { label: "Run a practice kickoff with an old game manual", team: "design" },
      { label: "Present a strategy plan on a timer", team: "design" },
      { label: "Double-check the practice robot works", team: "electrical" },
    ] },

  // ---- Build Season (Kickoff -> first event, ~6-8 weeks) ----
  { id: "bs-strategy", phase: "Build Season", offset: 3, team: "design",
    label: "Game strategy set",
    short: "Set Strategy",
    detail: "Game manual read, priorities agreed on as a team -- FIRST's own timeline allots the first 2-3 days for this.",
    expanded: "Read the manual as a full team, then narrow down to the two or three game tasks your robot will actually prioritize. FIRST's own build season timeline allots roughly the first 2-3 days to this -- spending much longer usually just delays prototyping without meaningfully improving the strategy.",
    subtasks: [
      { label: "Read the game manual as a full team", team: "design" },
      { label: "Agree on top priorities", team: "design" },
    ] },
  { id: "bs-concepts", phase: "Build Season", offset: 5, team: "design",
    label: "Pick ideas to prototype",
    short: "Pick Concepts",
    detail: "Mechanism brainstorming done and which concepts to prototype decided.",
    expanded: "Turn your strategy into a short list of mechanism concepts worth building rough prototypes of. The goal isn't a finished design yet -- it's picking which two or three approaches per mechanism are worth a few days of prototyping before committing to one in CAD.",
    subtasks: [
      { label: "Brainstorm ideas for each mechanism", team: "design" },
      { label: "Pick top ideas to build and test", team: "design" },
    ] },
  { id: "bs-prototyping", phase: "Build Season", offset: 12, team: "design",
    label: "Prototyping complete",
    short: "Prototyping Done",
    detail: "Rough mechanism prototypes built and tested enough to commit to a direction.",
    expanded: "By this point you should have tested rough versions of your key mechanisms enough to know which approach works and commit to it. It's normal for prototypes to look rough -- the point is answering \"will this actually work\" before spending fabrication time on a polished version.",
    subtasks: [
      { label: "Build rough prototypes", team: "design" },
      { label: "Test prototypes & pick a final design", team: "design" },
    ] },
  { id: "bs-cad", phase: "Build Season", offset: 23, team: "design",
    label: "Robot design finished",
    short: "CAD Done",
    detail: "Full robot modeled and ready to release for fabrication -- a first draft should already exist by day 18.",
    expanded: "A first draft of the CAD should be ready around 2.5 weeks in, enough for fabrication to start cutting the parts that are already settled. The full model -- mounting, wiring routing, and the bumper/frame perimeter -- should be finished and released only 2 days before fabrication itself wraps up, so the shop isn't left waiting on late design changes.",
    subtasks: [
      { label: "Model the whole robot in CAD (first draft by ~2.5 weeks in)", team: "design" },
      { label: "Plan wiring & finish the bumpers/frame", team: "design" },
      { label: "Release the final design for building", team: "design" },
    ] },
  { id: "bs-fab", phase: "Build Season", offset: 25, team: "mechanical",
    label: "Robot parts built",
    short: "Fab Done",
    detail: "Main structural and mechanism parts cut, machined, or printed -- held to a 1-week sprint off the first CAD draft.",
    expanded: "Structural parts, drivetrain, and your main mechanisms should be cut, machined, or printed within a tight 1-week sprint, starting as soon as the first CAD draft is ready. This is the busiest shop week of the season -- if fabrication is running behind, it's often better to cut scope on a mechanism than to let it slip into assembly week.",
    subtasks: [
      { label: "Cut/machine the frame & drivetrain parts", team: "mechanical" },
      { label: "Build the main mechanism parts", team: "mechanical" },
    ] },
  { id: "bs-assembly", phase: "Build Season", offset: 36, team: "mechanical",
    label: "Robot built",
    short: "Assembly Done",
    detail: "Competition robot's structure fully assembled and mechanisms mounted -- wiring is tracked as its own milestone right after this.",
    expanded: "Everything should be bolted together on the actual competition robot, not just the practice chassis, in the roughly 2-week window right after fabrication wraps. Wiring is tracked separately as its own milestone immediately after this one, so assembly doesn't have to wait on the electrical team to finish before it's considered done.",
    subtasks: [
      { label: "Put the robot together", team: "mechanical" },
    ] },
  { id: "bs-wiring", phase: "Build Season", offset: 43, team: "electrical",
    label: "Robot wired",
    short: "Wiring Done",
    detail: "Full power path, CAN bus, and sensor wiring complete and strain-relieved -- about a 1-week window right after assembly.",
    expanded: "With the robot physically assembled, electrical gets its own dedicated week to run the full power path, CAN bus, and sensor wiring, then label and strain-relieve all of it before it disappears behind panels and bumpers. Programming can start loading code onto the robot a couple of days before this fully wraps, once the core systems are live.",
    subtasks: [
      { label: "Wire the robot", team: "electrical" },
      { label: "Label and strain-relieve all wiring", team: "electrical" },
    ] },
  { id: "bs-code", phase: "Build Season", offset: 45, team: "programming",
    label: "Code running on the real robot",
    short: "Code on Robot",
    detail: "Code running on the actual robot, not just the practice chassis -- starts once core wiring is live, overlapping wiring's last couple of days.",
    expanded: "Move your code off the practice chassis and onto the real robot -- sensors, motor IDs, and wiring are never identical between the two, so this always takes longer than expected. Start as soon as the core systems are wired (around day 42) rather than waiting for wiring to fully wrap, so there's less dead time before driver practice needs a working robot. Get basic teleop driving and at least one autonomous routine running on the competition bot itself before spending more time polishing either.",
    subtasks: [
      { label: "Move code to the real robot", team: "programming" },
      { label: "Get driving working on the real robot", team: "programming" },
      { label: "Get autonomous working on the real robot", team: "programming" },
    ] },
  { id: "bs-practice", phase: "Build Season", offset: 48, team: "mechanical",
    label: "Driving practice & fixes",
    short: "Driver Practice",
    detail: "Regular driver practice time scheduled, punch list of fixes being worked through -- running right up to the day before the first event.",
    expanded: "Get drivers real stick time on the actual robot, and start a running punch list of fixes and improvements from what you see, for the few days you have before the first event. With a short practice window, triage the punch list by whatever actually affects scoring or reliability first.",
    subtasks: [
      { label: "Schedule regular driving practice", team: "mechanical" },
      { label: "Keep a running list of fixes", team: "mechanical" },
    ] },

  // ---- Competition Season (first event -> last event) ----
  { id: "cs-event1", phase: "Competition Season", offset: 49, team: "cross-team",
    label: "First competition event attended",
    short: "Event #1",
    detail: "Robot competing at its first regional or district event.",
    expanded: "Your robot is competing for real. Treat this event as data collection as much as competition -- note what broke, what the drive team struggled with, and what alliance partners' robots do well, since all of it feeds directly into how you spend the weeks before your next event.",
    subtasks: [
      { label: "Compete at the first event", team: "cross-team" },
      { label: "Write down what broke or was hard", team: "mechanical" },
    ] },
  { id: "cs-scouting", phase: "Competition Season", offset: 49, team: "business",
    label: "Scouting running at events",
    short: "Scouting Live",
    detail: "Match scouting (paper or app) actually being collected and used for alliance selection.",
    expanded: "Whatever scouting tool you built or tested in the preseason should be in actual use in the stands -- collecting match data your alliance-selection lead can use, not just sitting on a laptop. If it's not working smoothly yet, this is the event to fix it, not the one right before champs.",
    subtasks: [
      { label: "Collect scouting data during matches", team: "business" },
      { label: "Use scouting data to pick alliances", team: "business" },
    ] },
  { id: "cs-awards", phase: "Competition Season", offset: 60, team: "business",
    label: "Award submissions completed",
    short: "Awards Submitted",
    detail: "Impact/Chairman's Award, Engineering Inspiration, and other written submissions turned in.",
    expanded: "Impact Award (formerly Chairman's), Engineering Inspiration, and any other written award submissions your team is eligible for should be turned in. These often have earlier deadlines than teams expect, and the writing goes faster if you've been logging outreach and documentation all season instead of reconstructing it now.",
    subtasks: [
      { label: "Submit the Impact Award essay", team: "business" },
      { label: "Submit other award essays", team: "business" },
    ] },
  { id: "cs-iterate", phase: "Competition Season", offset: 70, team: "mechanical",
    label: "Fix & improve the robot between events",
    short: "Iterate / Repair",
    detail: "Fixes and improvements from event 1 carried into later events.",
    expanded: "Whatever your first event exposed -- a mechanism that jams, a code bug, a repeated foul -- should be fixed and tested before your next event, not patched in the pits. This is also a good checkpoint to revisit your scouting data and see if your game strategy still holds up against what other teams are doing.",
    subtasks: [
      { label: "Fix problems from the last event", team: "mechanical" },
      { label: "Update strategy based on other teams", team: "design" },
    ] },
  { id: "cs-champs", phase: "Competition Season", offset: 90, team: "cross-team",
    label: "Find out if you're going to champs",
    short: "Champs Decided",
    detail: "Team knows whether it's advancing to district/state champs or the FIRST Championship.",
    expanded: "By now your team should know whether it's advancing to a district/state championship or the FIRST Championship. Whichever way it goes, this is the natural checkpoint to start planning the postseason -- what to fix for next year, and how to wrap up outreach and sponsor relationships either way.",
    subtasks: [
      { label: "Check championship qualification status", team: "business" },
      { label: "Start planning for after the season", team: "business" },
    ] },

  // ---- Postseason (last event -> next preseason) ----
  { id: "post-thankyou", phase: "Postseason", offset: 115, team: "business",
    label: "Thank sponsors & share results",
    short: "Thank Sponsors",
    detail: "Every sponsor and grantor hears back about how their support was used while the season is still fresh.",
    expanded: "Every sponsor and grant-maker should hear specifically how their support was used -- a photo, a result, a number of students reached -- while the season is still fresh. This is also the single best thing you can do to make next year's renewal conversation easier.",
    subtasks: [
      { label: "Send thank-you letters to sponsors", team: "business" },
      { label: "Share a season results summary", team: "business" },
    ] },
  { id: "post-archive", phase: "Postseason", offset: 120, team: "cross-team",
    label: "Archive season files",
    short: "Archive Season",
    detail: "Photos, videos, CAD files, and code from the season organized for next year's team and future award submissions.",
    expanded: "Pull together this season's photos, videos, CAD files, and code into somewhere next year's team -- and you, writing next year's award submissions -- can actually find them. Teams that skip this step usually end up rebuilding institutional knowledge from scratch every August.",
    subtasks: [
      { label: "Organize season photos and videos", team: "business" },
      { label: "Save CAD files & code for next year", team: "design" },
    ] },
  { id: "post-offseason-demo", phase: "Postseason", offset: 160, team: "business",
    label: "Show off the robot",
    short: "Off-season Demo",
    detail: "Robot shown off at a summer/fall off-season event, school event, or community demo.",
    expanded: "Show the robot off -- at a summer off-season competition, a school event, or a community demo. It's good outreach, it's a low-stakes way to onboard new members on the real robot, and it keeps the team visible to sponsors and your school between seasons.",
    subtasks: [
      { label: "Book a demo or event", team: "business" },
      { label: "Show off the robot in person", team: "business" },
    ] },
  { id: "post-leads", phase: "Postseason", offset: 180, team: "business",
    label: "Pick next year's leads",
    short: "Assign Leads",
    detail: "Team captains and subteam leads for next season decided before the new members show up.",
    expanded: "Decide who's leading each subteam next season before new members show up in the fall. Handing off leadership with enough runway for the outgoing lead to actually mentor their replacement tends to matter more than who gets picked.",
    subtasks: [
      { label: "Pick next year's subteam leads", team: "business" },
      { label: "Have leads mentor their replacements", team: "business" },
    ] },
  { id: "post-renewal", phase: "Postseason", offset: 200, team: "business",
    label: "Reach out to sponsors again",
    short: "Sponsor Renewal",
    detail: "Early outreach to last year's sponsors -- most decide next year's giving budget over the summer.",
    expanded: "Reach out to last year's sponsors early -- most companies and foundations set their giving budgets over the summer, so a renewal ask in August lands very differently than one in November. This is also the natural bridge back into the preseason roster and registration milestone.",
    subtasks: [
      { label: "Ask last year's sponsors to renew", team: "business" },
      { label: "Start planning next season's roster", team: "business" },
    ] },
];

// ---- Fine-grained calendar goals (generated, not hand-typed) ----
//
// These are calendar-only -- they don't clutter the main checklist, but
// they're exactly the "daily goals" a team can check off day by day.
// Preseason gets a weekly cadence and build season gets a day-by-day
// build phase, since both have a fixed, universal shape from FIRST's own
// timeline. Competition season's daily tasks are generated separately,
// below `window.SEASON_FINE_GOALS`, since -- unlike these two -- they
// depend on a per-team setting (subteam roster size) rather than being
// fixed at load time. Postseason varies too much team to team (whether
// you make champs, how many off-season events you attend) to responsibly
// invent a daily schedule for it, so it stays at the milestone level
// above.
(function () {
  "use strict";

  var fine = [];

  // Weekly preseason goals (LearnFRC's 18-week plan, subdivided into a
  // logical weekly step toward each phase's stated deliverable).
  var PRESEASON_WEEKS = [
    { week: 1, team: "business", short: "Assign Leads", label: "Assign subteam leads for the season" },
    { week: 2, team: "business", short: "Lock Registration", label: "Confirm event registration & payment deadlines" },
    { week: 3, team: "business", short: "Kickoff Kit Plan", label: "Finalize Kickoff Kit selection plan" },
    { week: 4, team: "mechanical", short: "Drivetrain Start", label: "Start training chassis drivetrain fabrication" },
    { week: 5, team: "electrical", short: "Wire CAN Bus", label: "Wire power path & CAN bus on training chassis" },
    { week: 6, team: "programming", short: "Drivetrain Code", label: "Get basic drivetrain code running" },
    { week: 7, team: "programming", short: "Chassis Drives", label: "Training chassis drives under teleop" },
    { week: 8, team: "electrical", short: "Mount Vision", label: "Mount vision/camera system on practice bot" },
    { week: 9, team: "programming", short: "Tune PID", label: "Tune one PID-controlled motion" },
    { week: 10, team: "programming", short: "Build Auto Path", label: "Build one autonomous path" },
    { week: 11, team: "programming", short: "Auto Runs E2E", label: "Autonomous path runs start to finish" },
    { week: 12, team: "business", short: "Fall Event", label: "Attend a fall off-season event" },
    { week: 13, team: "business", short: "Test Scouting", label: "Test scouting system live at an event" },
    { week: 14, team: "business", short: "Draft Impact Award", label: "Start drafting the Impact Award narrative" },
    { week: 15, team: "design", short: "Old Manual", label: "Pull an old game manual for mock kickoff" },
    { week: 16, team: "design", short: "Mock Strategy", label: "Run a mock kickoff strategy session" },
    { week: 17, team: "electrical", short: "Verify Systems", label: "Verify teleop, auto, and electrical on practice bot" },
    { week: 18, team: "mechanical", short: "Final Check", label: "Final practice robot check before Kickoff" },
  ];

  PRESEASON_WEEKS.forEach(function (w) {
    // Preseason spans the 18 weeks immediately before Kickoff (offset 0).
    var offset = -126 + w.week * 7;
    fine.push({
      id: "fine-ps-wk" + w.week,
      phase: "Preseason",
      offset: offset,
      team: w.team,
      granularity: "weekly",
      short: w.short,
      label: "Preseason Wk " + w.week + ": " + w.label,
      detail: w.label + " (preseason week " + w.week + " of 18).",
    });
  });

  // Daily build season goals, derived from FIRST's own Build Season
  // Timeline phase ranges (see header comment for the source). Each day's
  // headline is whichever active phase started most recently -- i.e. the
  // newest thing the team should be shifting focus onto -- with the
  // other concurrent phases noted in the detail line.
  //
  // Each handoff phase's boundaries are kept in sync with the matching
  // checklist deadline above (bs-prototyping=12, bs-cad=23, bs-fab=25,
  // bs-assembly=36, bs-wiring=43, bs-code=45, bs-practice=48): a phase
  // should mostly be *done* by the point its checklist milestone is due,
  // with just a few days of overlap into the next phase for realistic
  // handoff (fabrication starting off the first CAD draft while the full
  // release is still being finished, code moving onto the robot a couple
  // of days before wiring is fully done, etc.) -- rather than, e.g.,
  // fabrication starting two full weeks before CAD is checklisted as
  // finished. This build runs tighter than a default FRC season:
  // CAD/fab/assembly/wiring are compressed so driver practice has
  // guaranteed (if short) runway before the first event.
  //
  // `testing` (ongoing code testing/tuning, as opposed to `programming`'s
  // initial dev work) intentionally starts late -- once wiring is underway
  // -- so it reads as background context during fab/assembly/wiring
  // instead of stealing their headline the moment it begins.
  var BUILD_PHASES = [
    { key: "strategy", short: "Strategy", team: "design", start: 1, end: 3 },
    { key: "concepts", short: "Concepts", team: "design", start: 3, end: 5 },
    { key: "prototyping", short: "Prototyping", team: "design", start: 6, end: 12 },
    { key: "cad", short: "CAD", team: "design", start: 8, end: 23 },
    { key: "fab", short: "Fabrication", team: "mechanical", start: 18, end: 25 },
    { key: "assembly", short: "Assembly", team: "mechanical", start: 22, end: 36 },
    { key: "wiring", short: "Wiring", team: "electrical", start: 36, end: 43 },
    { key: "programming", short: "Programming", team: "programming", start: 8, end: 36 },
    { key: "testing", short: "Code Testing", team: "programming", start: 36, end: 52 },
    { key: "code", short: "Code on Robot", team: "programming", start: 42, end: 45 },
    { key: "practice", short: "Practice", team: "mechanical", start: 45, end: 48 },
  ];

  for (var day = 1; day <= 49; day++) {
    var active = BUILD_PHASES.filter(function (p) { return day >= p.start && day <= p.end; });
    if (!active.length) continue;
    active.sort(function (a, b) { return b.start - a.start; });
    var headline = active[0];
    var others = active.slice(1).map(function (p) { return p.short; });

    fine.push({
      id: "fine-bs-day" + day,
      phase: "Build Season",
      offset: day,
      team: headline.team,
      granularity: "daily",
      short: "Day " + day + ": " + headline.short,
      label: "Build Day " + day + ": " + headline.short,
      detail: "Day " + day + " of build season. Main focus: " + headline.short +
        (others.length ? "; also ongoing: " + others.join(", ") + "." : "."),
    });
  }

  window.SEASON_FINE_GOALS = fine;
})();

// ---- Mechanism-specific build season tasks (roster-aware, generated) ----
//
// The generic day-by-day build season goals above ("Day 20: CAD") describe
// what phase the *team* should be in, but say nothing about what's
// actually on the robot. Once a team tells us what they're building
// (season.html's "What's on your robot this year?" list, e.g. "Intake",
// "Climber"), we generate a concrete task per mechanism per build phase --
// "Finish Intake design (CAD)", "Finish machining Climber parts", etc. --
// so the calendar has real, specific work instead of only generic
// checkpoints. Every mechanism goes through the same phase order (they're
// normally worked in parallel), staggered by a couple of days per
// mechanism so a team with several of them doesn't get every task piled
// onto the exact same day.
var SEASON_MECHANISM_STEPS = [
  { day: 4, team: "design", short: "Brainstorm", label: "Brainstorm {m} concepts and pick 2-3 worth prototyping" },
  { day: 11, team: "mechanical", short: "Prototype", label: "Build and test a rough {m} prototype" },
  { day: 19, team: "design", short: "Finish CAD", label: "Finish {m} design (CAD) and release it for fabrication" },
  { day: 22, team: "mechanical", short: "Machine Parts", label: "Finish machining/printing {m} parts" },
  { day: 28, team: "mechanical", short: "Assemble", label: "Assemble {m} onto the robot" },
  { day: 37, team: "electrical", short: "Wire", label: "Wire {m} motors, sensors, and wiring" },
  { day: 42, team: "programming", short: "Code", label: "Write and bench-test {m} control code" },
  { day: 45, team: "mechanical", short: "Test & Tune", label: "Test and tune {m} on the competition robot" },
];

function seasonSlugify(s, fallback) {
  var slug = String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || fallback;
}

// `mechanisms` is an array of strings the team entered, e.g. ["Intake",
// "Climber"]. Returns Build Season fine-goal objects, staggered so
// multiple mechanisms don't all land on the same days.
window.buildMechanismGoals = function (mechanisms) {
  var goals = [];
  var STAGGER_DAYS = 2;

  (mechanisms || []).forEach(function (m, mIdx) {
    var slug = seasonSlugify(m, "mech" + mIdx);
    SEASON_MECHANISM_STEPS.forEach(function (step, stepIdx) {
      var day = Math.min(49, Math.max(1, step.day + mIdx * STAGGER_DAYS));
      var label = step.label.replace(/\{m\}/g, m);
      goals.push({
        id: "fine-bs-mech-" + slug + "-" + stepIdx,
        phase: "Build Season",
        offset: day,
        team: step.team,
        granularity: "daily",
        short: step.short + ": " + m,
        label: label,
        detail: label + " -- part of building the " + m + " subsystem.",
      });
    });
  });

  return goals;
};

// ---- Competition season daily tasks (roster-aware, generated) ----
//
// Competition season doesn't have a fixed universal shape the way
// preseason/build season do (event count and dates vary team to team), so
// instead of a fixed calendar we generate one: each subteam gets its own
// pool of specific, competition-relevant tasks, and how often a subteam's
// tasks show up on the calendar scales with how many students are on it
// (season.html's Team Settings panel; season.js persists it and calls
// buildCompetitionSeasonGoals with the result). A bigger subteam has more
// hands free to always have something in flight, so it gets a task most
// or every day; a one- or two-person subteam gets a task every few days
// instead of being asked to do something new daily. Tasks rotate through
// each pool in order before repeating, so the season doesn't loop the
// same handful of lines -- and since only a couple of entries per pool
// mention driver practice, it shows up occasionally, not constantly.
window.SEASON_COMPETITION_POOLS = {
  mechanical: [
    { short: "Fastener Check", label: "Inspect and tighten fasteners across the drivetrain and mechanisms" },
    { short: "Pit Kit Restock", label: "Restock and reorganize the pit spare-parts kit" },
    { short: "Wheel/Tread Swap", label: "Inspect wheels and treads and swap any that are worn" },
    { short: "Chain/Belt Check", label: "Clean, lubricate, and inspect chains, belts, and gearboxes" },
    { short: "Pit-Stop Drill", label: "Run a pit-stop drill: swap a battery and clear a simulated jam in under two minutes" },
    { short: "Fab Replacement", label: "Fabricate or 3D print replacement parts for anything that broke last event" },
    { short: "Reliability Run", label: "Run mechanisms back-to-back to simulate a full match day and catch failures early" },
    { short: "Bumper Check", label: "Inspect bumpers and the frame perimeter for damage and rule compliance" },
    { short: "Practice: Endgame", label: "Run focused driver practice reps on the endgame/climb routine" },
    { short: "Wiring Strain Check", label: "Recheck wiring strain relief and connectors after transport and competition use" },
    { short: "Update Pit Checklist", label: "Review and update the pit-crew checklist from the last event" },
    { short: "Practice: Cycle Time", label: "Run driver practice focused on cycle time and consistency" },
  ],
  electrical: [
    { short: "Battery Rotation", label: "Check and rotate battery charge cycles; retire any battery below spec" },
    { short: "Connector Check", label: "Inspect connectors and wire crimps for wear or corrosion" },
    { short: "Panel Relabel", label: "Relabel and photograph the electrical panel for faster pit troubleshooting" },
    { short: "Backup Wiring Kit", label: "Build or restock a spare wiring harness kit for quick swaps" },
    { short: "Voltage Check", label: "Check voltage drop under load on the drivetrain and mechanisms" },
    { short: "CAN Bus Audit", label: "Audit CAN bus wiring and device IDs for loose connections" },
    { short: "Radio/Comms Check", label: "Test radio and driver station comms for a clean connection" },
    { short: "Practice: Power Cycle", label: "Time a full robot power-cycle and boot sequence for pit efficiency" },
    { short: "Sensor Recalibrate", label: "Recalibrate sensors (gyro, encoders, limit switches) after transport" },
    { short: "Indicator Check", label: "Check status LEDs and indicators used for pit diagnostics" },
  ],
  programming: [
    { short: "Code Review", label: "Review and clean up autonomous and teleop code from the last event" },
    { short: "Log Bugs", label: "Log and triage bugs and glitches seen at the last event" },
    { short: "Tune Autonomous", label: "Retune autonomous paths based on the last event's field conditions" },
    { short: "Dashboard Update", label: "Update the driver station dashboard with the data the drive team actually needs" },
    { short: "Practice: Auto Reliability", label: "Run autonomous routines repeatedly to confirm reliability" },
    { short: "Vision Tuning", label: "Retune the vision/AprilTag pipeline lighting thresholds for the next venue" },
    { short: "Backup Code Path", label: "Build or test a simplified backup autonomous/teleop mode" },
    { short: "Data Log Review", label: "Review match data logs for unexpected sensor or controller behavior" },
    { short: "Practice: Driver Feedback", label: "Get driver feedback on control feel and adjust sensitivity/curves" },
    { short: "Repo Cleanup", label: "Clean up and tag the code repository after the last event" },
    { short: "Pit Display Check", label: "Confirm the pit and scouting display tools are working correctly" },
    { short: "Simulate Match Code", label: "Simulate a full match sequence in code to catch state-machine bugs" },
  ],
  design: [
    { short: "Post-Event Debrief", label: "Debrief with the drive team and mentors on what worked and what didn't" },
    { short: "Strategy Update", label: "Update game strategy based on scouting data from other teams" },
    { short: "Alliance Selection Prep", label: "Prepare alliance-selection criteria and target picks for the next event" },
    { short: "Iteration Plan", label: "Turn the punch list into a prioritized iteration plan for the next event" },
    { short: "CAD Update", label: "Update CAD to reflect any on-the-fly changes made at the last event" },
    { short: "Rules Recheck", label: "Re-examine field elements and rules for any missed scoring opportunities" },
    { short: "Match Video Review", label: "Review match video with the team to spot mechanism or driving issues" },
    { short: "Opponent Trends", label: "Track trends across other teams' robots and playing styles" },
    { short: "Practice: Strategy Call", label: "Run a mock strategy call under a timer, like alliance selection" },
    { short: "Postmortem Doc", label: "Write up a short postmortem of anything that broke and why" },
  ],
  business: [
    { short: "Scouting Data Review", label: "Clean up and review scouting data collected at the last event" },
    { short: "Sponsor Update", label: "Send a short update to sponsors about how the last event went" },
    { short: "Social Media Post", label: "Post event photos and a recap to team social media" },
    { short: "Award Draft Update", label: "Add fresh details from the last event to the Impact Award draft" },
    { short: "Fundraising Check-in", label: "Check in on merch sales or fundraising totals" },
    { short: "Volunteer Coordination", label: "Confirm volunteer and chaperone coverage for the next event" },
    { short: "Scouting Lead Training", label: "Train new scouts on the scouting app/spreadsheet before the next event" },
    { short: "Travel Logistics", label: "Confirm travel, lodging, and pit logistics for the next event" },
    { short: "Thank-You Notes", label: "Send thank-you notes to any judges, volunteers, or hosts from the last event" },
    { short: "Practice: Judging Q&A", label: "Run a mock judging Q&A session with the team" },
    { short: "Budget Check-in", label: "Check the remaining season budget against upcoming event costs" },
    { short: "Outreach Post", label: "Share a season update with school or community partners" },
  ],
};

// How many days apart a subteam's tasks land, based on its member count --
// more students means more bandwidth to always have something going, so
// their tasks show up more often; a one- or two-person subteam gets a
// lighter, less frequent cadence instead of a new task every single day.
function seasonCadenceForTeamSize(n) {
  if (!n || n <= 0) return 0; // no members on this subteam -> no tasks generated
  if (n === 1) return 6;
  if (n === 2) return 4;
  if (n === 3) return 3;
  if (n <= 5) return 2;
  return 1;
}
window.seasonCadenceForTeamSize = seasonCadenceForTeamSize;

// Builds the roster-aware Competition Season daily items for offsets
// 49-90 (Kickoff+49 through Kickoff+90). `teamSizes` is a
// {mechanical, electrical, programming, design, business} map of student
// counts; `teamLabels` optionally maps team id -> display name for the
// generated detail text.
window.buildCompetitionSeasonGoals = function (teamSizes, teamLabels) {
  var TEAM_ORDER = ["mechanical", "electrical", "programming", "design", "business"];
  var goals = [];

  TEAM_ORDER.forEach(function (team, teamIdx) {
    var size = (teamSizes && teamSizes[team]) || 0;
    var cadence = seasonCadenceForTeamSize(size);
    if (!cadence) return;

    var pool = window.SEASON_COMPETITION_POOLS[team] || [];
    if (!pool.length) return;

    var dayOffset = teamIdx % cadence; // stagger subteams so they don't all land on the same days
    var poolIdx = 0;
    var teamName = (teamLabels && teamLabels[team]) || team;

    for (var day = 49; day <= 90; day++) {
      if ((day - 49 - dayOffset) % cadence !== 0) continue;
      var task = pool[poolIdx % pool.length];
      poolIdx++;
      var compDayNum = day - 48;

      goals.push({
        id: "fine-cs-day" + day + "-" + team,
        phase: "Competition Season",
        offset: day,
        team: team,
        granularity: "daily",
        short: task.short,
        label: "Comp Day " + compDayNum + " (" + teamName + "): " + task.label,
        detail: task.label + " -- day " + compDayNum + " of competition season, " + size + "-person " + teamName + " subteam.",
      });
    }
  });

  return goals;
};
