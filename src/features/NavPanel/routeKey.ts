export const resolveNavPanelKey = (
  pathname: string,
  activeWorkspaceSlug: string | null,
): string => {
  const segments = pathname.split('/').filter(Boolean);
  const isWorkspaceRoute =
    !!activeWorkspaceSlug && segments.length > 0 && segments[0] === activeWorkspaceSlug;
  const routeSegments = isWorkspaceRoute ? segments.slice(1) : segments;
  const [rootSegment, childSegment, grandchildSegment] = routeSegments;

  if (rootSegment === 'settings') {
    return isWorkspaceRoute ? 'workspace-settings' : 'settings';
  }

  switch (rootSegment) {
    case 'agent': {
      return grandchildSegment === 'docs' ? 'agent-docs' : 'agent';
    }

    case 'community': {
      return 'discover';
    }

    case 'eval': {
      return childSegment === 'bench' ? 'evalBench' : 'eval';
    }

    case 'group': {
      return 'group';
    }

    case 'image': {
      return 'image';
    }

    case 'memory': {
      return 'memory';
    }

    case 'page': {
      return 'page';
    }

    case 'project': {
      return 'project';
    }

    case 'resource': {
      // The resource home reuses the standard sidebar (like /tasks); only a
      // knowledge-base detail owns its dedicated tree sidebar.
      return childSegment === 'library' ? 'resourceLibrary' : 'home';
    }

    case 'video': {
      return 'video';
    }

    default: {
      return 'home';
    }
  }
};
