import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { JsonSchemaLike, JsonSchemaProperty } from '@/lib/server-api';

interface Props {
  schema: JsonSchemaLike | undefined | null;
}

interface Row {
  name: string;
  prop: JsonSchemaProperty;
  required: boolean;
}

function flattenProps(schema: JsonSchemaLike | undefined | null): Row[] {
  if (!schema || !schema.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    prop: prop as JsonSchemaProperty,
    required: required.has(name),
  }));
}

function describeType(p: JsonSchemaProperty): string {
  if (!p.type) return '—';
  if (p.type === 'array' && p.items?.type) {
    return `${p.items.type}[]`;
  }
  return p.type;
}

export function ParametersTable({ schema }: Props) {
  const t = useTranslations('docs');
  const rows = flattenProps(schema);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noParameters')}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('paramName')}</TableHead>
          <TableHead>{t('paramType')}</TableHead>
          <TableHead>{t('paramRequired')}</TableHead>
          <TableHead>{t('paramDescription')}</TableHead>
          <TableHead>{t('paramEnum')}</TableHead>
          <TableHead>{t('paramBundleDim')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ name, prop, required }) => (
          <TableRow key={name}>
            <TableCell className="font-mono text-xs">{name}</TableCell>
            <TableCell className="font-mono text-xs">{describeType(prop)}</TableCell>
            <TableCell>
              {required ? (
                <Badge variant="default">{t('yes')}</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{t('no')}</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {prop.description ?? '—'}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {Array.isArray(prop.enum) && prop.enum.length > 0
                ? prop.enum.map((v) => String(v)).join(', ')
                : '—'}
            </TableCell>
            <TableCell>
              {prop.bundleDimension ? (
                <Badge variant="secondary">{t('yes')}</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
