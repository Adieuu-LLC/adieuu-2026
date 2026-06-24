import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons/Icon';

interface LegalExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

export function LegalExternalLink({
  children,
  className,
  rel = 'noopener noreferrer',
  target = '_blank',
  ...props
}: LegalExternalLinkProps) {
  return (
    <a
      {...props}
      target={target}
      rel={rel}
      className={['legal-external-link', className].filter(Boolean).join(' ')}
    >
      {children}
      <span className="legal-external-link-icon" aria-hidden="true">
        <Icon name="externalLink" size="xs" />
      </span>
    </a>
  );
}

function isInternalPath(href: string | undefined): boolean {
  if (!href) return false;
  return href.startsWith('/') && !href.startsWith('//');
}

interface LegalInternalLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

function LegalInternalLink({ href, className, children }: LegalInternalLinkProps) {
  return (
    <Link
      to={href}
      rel="noopener noreferrer"
      className={['legal-internal-link', className].filter(Boolean).join(' ')}
    >
      {children}
      <span className="legal-external-link-icon" aria-hidden="true">
        <Icon name="externalLink" size="xs" />
      </span>
    </Link>
  );
}

export function enhanceLegalExternalLinks(node: ReactNode): ReactNode {
  if (node == null || typeof node === 'boolean') {
    return node;
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={index}>{enhanceLegalExternalLinks(child)}</Fragment>
    ));
  }

  if (!isValidElement(node)) {
    return node;
  }

  if (node.type === LegalExternalLink || node.type === LegalInternalLink) {
    return node;
  }

  if (node.type === 'a') {
    const { href, children: linkChildren, className } = node.props;

    if (isInternalPath(href)) {
      return (
        <LegalInternalLink href={href} className={className}>
          {linkChildren}
        </LegalInternalLink>
      );
    }

    if (node.props.target === '_blank') {
      return <LegalExternalLink {...node.props} />;
    }
  }

  const { children, ...rest } = node.props;
  if (children == null) {
    return node;
  }

  const enhancedChildren = Children.map(children, enhanceLegalExternalLinks);
  return cloneElement(node, rest, enhancedChildren);
}
