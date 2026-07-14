"use client";

// TODO: Wire these link cards to your real documentation, community and
// support URLs. Replace the FAQ entries with real content or fetch them
// from your CMS.

import type {ComponentType} from "react";

import {ArrowRightFromSquare, Book, Comment, LifeRing} from "@gravity-ui/icons";
import {Accordion, Card, Link} from "@heroui/react";

type HelpLink = {
  description: string;
  href: string;
  icon: ComponentType<{className?: string}>;
  title: string;
};

const HELP_LINKS: readonly HelpLink[] = [
  {
    description: "Read the docs, guides, and API reference to get up and running.",
    href: "#",
    icon: Book,
    title: "Documentation",
  },
  {
    description: "Join the community to ask questions, share tips, and connect with other users.",
    href: "#",
    icon: Comment,
    title: "Community",
  },
  {
    description: "Get help from our support team. We reply within one business day.",
    href: "#",
    icon: LifeRing,
    title: "Contact support",
  },
];

type FaqItem = {
  question: string;
  answer: string;
};

const FAQS: readonly FaqItem[] = [
  {
    answer:
      "Open Settings > Billing and click 'Change plan'. Changes take effect at the start of your next billing cycle.",
    question: "How do I upgrade my plan?",
  },
  {
    answer:
      "Yes. In Settings > Security turn on Two-factor authentication and follow the on-screen prompts.",
    question: "Can I enable two-factor authentication?",
  },
  {
    answer:
      "Head to Settings > General and click 'Delete account'. This action is irreversible and purges all your data after 30 days.",
    question: "How do I delete my account?",
  },
  {
    answer:
      "You can invite new members from Settings > Team. They'll receive an email invite with instructions to join.",
    question: "How do I invite teammates?",
  },
];

export function HelpPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 pb-10 pt-4">
      <p className="text-muted text-sm">Find answers, contact support, or dig into the docs.</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {HELP_LINKS.map((link) => (
          <HelpLinkCard key={link.title} link={link} />
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-foreground text-base font-semibold">Frequently asked questions</h2>
        <Accordion className="w-full">
          {FAQS.map((faq, index) => (
            <Accordion.Item key={faq.question} id={`faq-${index}`}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {faq.question}
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="text-muted text-sm">{faq.answer}</Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </section>

      <footer className="text-muted text-xs">
        Still stuck?{" "}
        <Link className="no-underline" href="mailto:support@example.com">
          support@example.com
        </Link>
      </footer>
    </div>
  );
}

function HelpLinkCard({link}: {link: HelpLink}) {
  const Icon = link.icon;

  return (
    <Card className="rounded-2xl">
      <Card.Header>
        <div className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </div>
        <Card.Title className="text-base">{link.title}</Card.Title>
        <Card.Description>{link.description}</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Link className="text-accent inline-flex items-center gap-1 text-sm" href={link.href}>
          Open
          <ArrowRightFromSquare className="size-3.5" />
        </Link>
      </Card.Footer>
    </Card>
  );
}
