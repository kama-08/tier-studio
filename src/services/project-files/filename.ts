export function projectFilename(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9\u00a0-\uffff_-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'my-ranking'
  );
}
