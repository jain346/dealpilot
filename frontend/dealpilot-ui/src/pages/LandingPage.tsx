/* ================================================================
   LANDING PAGE
   ================================================================ */

import { useState, useEffect } from "react";
import { Logo } from "../components";

export function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  const [activeSection, setActiveSection] = useState("home");
  const landingNav = [
    ["home", "Home"],
    ["product", "Product"],
    ["how-it-works", "How it works"],
    ["for-creators", "For Creators"],
    ["pricing", "Pricing"],
    ["faq", "FAQ"],
  ];
  const steps = [
    { number: "1", title: "Discover", text: "Find brands, campaigns, and commercial signals across the web." },
    { number: "2", title: "Research", text: "See the company context, audience, and partnership history." },
    { number: "3", title: "Fit", text: "Evaluate how well each opportunity matches your niche and goals." },
    { number: "4", title: "Take action", text: "Get clear recommendations and save the deals worth pursuing." },
  ];

  useEffect(() => {
    const sections = landingNav.map(([id]) => document.getElementById(id));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0.05, 0.25, 0.6] },
    );
    sections.forEach((section) => section && observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing-page">
      <header className="landing-header"><Logo /><nav className="landing-nav" aria-label="Landing page navigation">{landingNav.map(([id, label]) => <a key={id} href={`#${id}`} className={activeSection === id ? "active" : ""}>{label}</a>)}</nav><div className="landing-header-actions"><button className="landing-login" onClick={onLaunch}>Log in</button><button className="landing-launch" onClick={onLaunch}>Launch DealPilot <span aria-hidden="true">→</span></button></div></header>
      <section className="landing-hero" id="home">
        <div className="landing-copy"><span className="landing-kicker">Creator commercial intelligence</span><h1>Stop hunting for sponsors.<br /><strong>Start finding the right opportunities.</strong></h1><p>DealPilot uses AI agents to discover commercial signals, research brands, and tell you which partnerships actually fit your content, audience, and goals.</p><div className="landing-hero-actions"><button className="landing-launch" onClick={onLaunch}>Launch DealPilot <span aria-hidden="true">→</span></button><a className="landing-watch" href="#how-it-works"><span aria-hidden="true">▷</span> See how it works</a></div><div className="landing-proof-row"><span><b>✓</b> Find real opportunities</span><span><b>✓</b> Save hours of research</span><span><b>✓</b> Get a personalized fit score</span></div></div>
        <div className="landing-preview" aria-label="DealPilot opportunities preview">
          <div className="preview-glow" />
          <div className="preview-window">
            <div className="preview-sidebar"><Logo /><span>⌂ &nbsp; Home</span><span>◌ &nbsp; Chat</span><span className="preview-active">✦ &nbsp; Opportunities</span><span>◒ &nbsp; Research</span><span>◎ &nbsp; Fit analysis</span><span>◯ &nbsp; Profile</span></div>
            <div className="preview-content">
              <div className="preview-topline"><b>Opportunities</b><span>R&nbsp; Rahul</span></div>
              <div className="preview-search">⌕ &nbsp; Find sponsors for your niche</div>
              <div className="preview-filters"><span>All</span><span>Brands</span><span>Campaigns</span><span>Ambassador</span></div>
              {[["Nike", "Sports & Fitness", "92/100"], ["Adobe", "Creative Tools", "88/100"], ["GoPro", "Travel & Adventure", "84/100"]].map(([brand, category, score]) => (
                <div className="preview-opportunity" key={brand}><div className="preview-brand-mark">{brand === "Nike" ? "✓" : brand === "Adobe" ? "A" : "G"}</div><div><b>{brand}</b><small>{category}</small><em>Looking for creators with an engaged audience.</em></div><strong>{score}<small> Strong fit</small></strong></div>
              ))}
            </div>
          </div>
          <span className="preview-caption">Real opportunities.<br /><b>Powered by AI.</b></span>
        </div>
      </section>
      <section className="landing-story landing-product" id="product"><div className="landing-story-copy"><span className="landing-kicker">More than a search tool</span><h2>AI agents that<br /><strong>work for creators.</strong></h2><p>DealPilot's multi-agent system discovers opportunities, researches brands, and evaluates the best fit for your unique content, audience, and goals.</p><button className="landing-launch" onClick={onLaunch}>Explore the product <span aria-hidden="true">→</span></button></div><div className="agent-map"><div className="agent-map-director">✦ &nbsp; Director Agent</div><div className="agent-map-line" /><div className="agent-map-cards"><span>◉<b>Opportunity Agent</b><small>Brand discovery<br />Campaign search<br />Market signals</small></span><span>▤<b>Research Agent</b><small>Company research<br />Product analysis<br />Past partnerships</small></span><span>✧<b>Fit Agent</b><small>Audience fit<br />Brand alignment<br />Recommendation</small></span></div><strong>Structured insights → Real opportunities</strong></div></section>
      <section className="landing-process" id="how-it-works"><div className="landing-section-heading"><h2>How <strong>DealPilot</strong> works</h2><p>From signal to sponsorship, powered by AI agents and parallel research.</p></div><div className="landing-steps">{steps.map((step) => <article className="landing-step" key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
      <section className="landing-story landing-creators" id="for-creators"><div className="creator-stats"><span><b>10x</b><small>Faster research</small></span><span><b>100+</b><small>Brands discovered daily</small></span><span><b>90%</b><small>Time saved</small></span></div><div className="landing-story-copy"><span className="landing-kicker">Turn insights into income</span><h2>A smarter way to<br /><strong>grow as a creator.</strong></h2><p>Spend less time searching and more time creating. DealPilot helps you find the right brands, at the right time, with the right message.</p></div></section>
      <section className="landing-pricing" id="pricing"><div className="landing-section-heading"><span className="landing-kicker">Simple by design</span><h2>Ready to find your next <strong>big opportunity?</strong></h2><p>Start exploring brand partnerships with DealPilot.</p></div><div className="pricing-card"><div><span className="pricing-label">Creator workspace</span><h3>Free to start</h3><p>Discover opportunities, research brands, and build your commercial profile.</p></div><button className="landing-launch" onClick={onLaunch}>Launch DealPilot <span aria-hidden="true">→</span></button></div></section>
      <section className="landing-faq" id="faq"><div className="landing-section-heading"><span className="landing-kicker">Questions, answered</span><h2>Frequently asked <strong>questions.</strong></h2></div><div className="faq-list"><details><summary>What does DealPilot help creators find?</summary><p>DealPilot surfaces timely brand, campaign, and partnership opportunities matched to your niche and audience.</p></details><details><summary>How does the personalized fit score work?</summary><p>It evaluates your creator profile against audience, content, market, timing, and partnership signals.</p></details><details><summary>Can I update my creator profile later?</summary><p>Yes. Your saved profile remains available from the Profile tab and can be edited whenever your work evolves.</p></details></div></section>
      <section className="landing-bottom-band"><h2>Built for today's creators.<br /><strong>Ready for what's next.</strong></h2><div><span>♧ <b>More opportunities</b><small>Discover brands you wouldn't find on your own.</small></span><span>◷ <b>Less manual work</b><small>Focus on creating, not searching.</small></span><span>▥ <b>Smarter decisions</b><small>Spend time on the deals that fit.</small></span></div></section>
      <footer className="landing-footer"><Logo /><span>Find the next right deal.</span><small>© 2026 DealPilot. Built for creators, by AI.</small></footer>
    </main>
  );
}
