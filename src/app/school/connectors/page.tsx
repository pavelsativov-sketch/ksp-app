import { Card, CardContent } from '@/components/ui/card';
import { getDict } from '@/lib/i18n/server';
import { Link2 } from 'lucide-react';

export default async function PlaceholderPage() {
  const { t } = await getDict();
  return (
    <div className="max-w-3xl mx-auto mt-12">
      <Card className="text-center border-dashed border-2">
        <CardContent className="pt-12 pb-12 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground">
            <Link2 size={32} />
          </div>
          <div>
            <div className="inline-block px-3 py-1 bg-ink text-white text-xs font-medium rounded-full mb-4">
              {t.school.placeholder.title}
            </div>
            <h2 className="text-xl font-semibold mb-2">Подключения</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t.school.placeholder.description}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
