"use client";

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
    description: "Guides for managing your wallet, viewing balances, and sending transactions.",
    href: "#",
    icon: Book,
    title: "Documentation",
  },
  {
    description: "Join the Discord to ask questions, share tips, and connect with other traders.",
    href: "#",
    icon: Comment,
    title: "Community",
  },
  {
    description: "Stuck on a transaction or recovery? Our support team replies within 24 hours.",
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
      "Portfolio values are refreshed every 60 seconds using the latest on-chain prices. Pull-to-refresh forces an immediate update.",
    question: "How often are balances updated?",
  },
  {
    answer:
      "Head to Settings → Security and enable biometric approvals. Every outbound transfer will then require Face ID / Touch ID confirmation.",
    question: "Can I require biometrics for every transfer?",
  },
  {
    answer:
      "Yes. Open Settings → Export and pick the year to download a CSV ready for your tax software.",
    question: "How do I export my transaction history?",
  },
  {
    answer:
      "Staking is non-custodial — your tokens stay in your wallet. Unstaking typically takes 1–7 days depending on the network.",
    question: "Do I keep custody when I stake?",
  },
];

export function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
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
        <Link className="no-underline" href="mailto:support@heroui.dev">
          support@heroui.dev
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
