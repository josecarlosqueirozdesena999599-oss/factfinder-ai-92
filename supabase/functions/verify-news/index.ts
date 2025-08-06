import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationRequest {
  content: string;
  url?: string;
  imageFile?: File;
}

const TRUSTED_SOURCES = [
  'g1.globo.com',
  'nytimes.com',
  'uol.com.br',
  'estadao.com.br',
  'folha.uol.com.br',
  'bbc.com',
  'reuters.com',
  'ap.org',
  'cnn.com',
  'agenciabrasil.ebc.com.br'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Function started, checking environment variables...');
    
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('GOOGLE_API_KEY present:', !!GOOGLE_API_KEY);
    console.log('SUPABASE_URL present:', !!SUPABASE_URL);
    console.log('SUPABASE_SERVICE_ROLE_KEY present:', !!SUPABASE_SERVICE_ROLE_KEY);

    if (!GOOGLE_API_KEY) {
      console.error('Google API key not found in environment');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuração da API não encontrada' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    console.log('Parsing request body...');
    const requestBody = await req.json();
    console.log('Request body received:', Object.keys(requestBody));
    
    const { content, url, imageFile }: VerificationRequest = requestBody;

    if (!content || content.trim().length === 0) {
      console.error('No content provided in request');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Conteúdo não fornecido' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Starting news verification for:', content.substring(0, 100) + '...');

    // Build comprehensive prompt for analysis
    const analysisPrompt = `
Você é um verificador de fatos profissional. Analise a seguinte informação e forneça uma verificação completa:

INFORMAÇÃO A VERIFICAR:
${content}
${url ? `URL: ${url}` : ''}

INSTRUÇÕES:
1. Verifique a credibilidade consultando fontes confiáveis como G1, New York Times, UOL, BBC, Reuters
2. Classifique como: VERDADEIRA, FALSA ou DUVIDOSA
3. Dê uma pontuação de 0-100 para veracidade
4. Forneça explicação detalhada e profissional
5. Liste critérios analisados (presença em fontes, consistência, linguagem, etc.)
6. Identifique possíveis fontes que confirmam ou refutam

Responda em JSON com esta estrutura:
{
  "classification": "verified|false|partial",
  "score": 85,
  "explanation": "Explicação detalhada profissional",
  "criteria": [
    {"name": "Presença em fontes confiáveis", "status": true},
    {"name": "Consistência com dados oficiais", "status": true},
    {"name": "Linguagem alarmista detectada", "status": false}
  ],
  "sources": [
    {"name": "G1", "url": "link", "verified": true},
    {"name": "UOL", "url": "link", "verified": false}
  ]
}`;

    // Call Google Gemini API
    console.log('Calling Gemini API...');
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: analysisPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        }
      })
    });

    console.log('Gemini API response status:', geminiResponse.status);

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error response:', errorText);
      throw new Error(`Erro na API do Google: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini API response structure:', Object.keys(geminiData));
    
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      console.error('No candidates in Gemini response:', geminiData);
      throw new Error('Resposta inválida da API do Google');
    }
    
    const analysisText = geminiData.candidates[0].content.parts[0].text;
    
    console.log('Raw Gemini response:', analysisText.substring(0, 200) + '...');

    // Parse JSON response from Gemini
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = analysisText.match(/```json\n(.*?)\n```/s) || analysisText.match(/\{.*\}/s);
      const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : analysisText;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      // Fallback analysis
      analysis = {
        classification: 'partial',
        score: 50,
        explanation: 'Não foi possível analisar completamente a informação. Recomenda-se verificação manual.',
        criteria: [
          { name: 'Análise automatizada', status: false }
        ],
        sources: []
      };
    }

    // Store image if provided
    let imageUrl = null;
    if (imageFile) {
      const fileName = `verification_${Date.now()}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verification-images')
        .upload(fileName, imageFile);

      if (!uploadError) {
        const { data } = supabase.storage
          .from('verification-images')
          .getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      }
    }

    // Save verification to database
    const { data: verification, error: dbError } = await supabase
      .from('news_verifications')
      .insert({
        content,
        url,
        classification: analysis.classification,
        score: analysis.score,
        explanation: analysis.explanation,
        sources: analysis.sources || [],
        criteria: analysis.criteria || [],
        image_url: imageUrl
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Erro ao salvar verificação');
    }

    console.log('Verification saved successfully:', verification.id);

    return new Response(JSON.stringify({
      success: true,
      verification: {
        ...verification,
        sources: verification.sources.map((source: any) => ({
          ...source,
          url: source.url || '#'
        }))
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in verify-news function:', error);
    console.error('Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Erro interno do servidor'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});