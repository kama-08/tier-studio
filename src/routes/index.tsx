import { createFileRoute } from '@tanstack/react-router';
import { ProjectLibrary } from '@/features/library/project-library';

export const Route = createFileRoute('/')({ component: ProjectLibrary });
