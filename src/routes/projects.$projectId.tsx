import { createFileRoute, notFound } from '@tanstack/react-router';
import { projects } from '@/app/services';
import { ProjectEditor } from '@/features/editor/components/project-editor';

export const Route = createFileRoute('/projects/$projectId')({
  loader: async ({ params }) => {
    const project = await projects.get(params.projectId);
    if (!project) throw notFound();
    return project;
  },
  component: EditorRoute,
});

function EditorRoute() {
  const project = Route.useLoaderData();
  return <ProjectEditor key={project.id} initialProject={project} />;
}
