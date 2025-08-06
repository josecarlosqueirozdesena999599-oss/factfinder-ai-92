import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Shield, Target, Users, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Donations = () => {
  const [pixKey, setPixKey] = useState("pix@ctd.com.br");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyPixKey = async () => {
    try {
      await navigator.clipboard.writeText(pixKey);
      setCopied(true);
      toast({
        title: "PIX copiado!",
        description: "A chave PIX foi copiada para sua área de transferência.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar a chave PIX.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Heart className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Apoie o CTD</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Sua contribuição é fundamental para mantermos a luta contra a desinformação. 
            Ajude-nos a construir um futuro mais informado e democrático.
          </p>
        </div>

        {/* PIX Donation */}
        <Card className="mb-12 ctd-card-shadow">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Doe via PIX</CardTitle>
            <CardDescription className="text-center">
              Sua contribuição ajuda a manter o CTD funcionando e melhorando cada vez mais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="max-w-md mx-auto">
              <Label htmlFor="pix-key">Chave PIX do CTD</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="pix-key"
                  value={pixKey}
                  readOnly
                  className="bg-secondary/50"
                />
                <Button
                  onClick={copyPixKey}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Clique no botão para copiar a chave PIX
              </p>
            </div>

            <div className="text-center p-6 bg-primary/10 rounded-lg">
              <p className="text-sm text-muted-foreground">
                ✨ <strong>Qualquer valor faz a diferença!</strong> ✨<br/>
                Sua doação é 100% destinada ao combate à desinformação.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Donations;