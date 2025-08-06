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
    
    // Handle different content types properly
    let requestBody;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle form data with files
      const formData = await req.formData();
      requestBody = {
        content: formData.get('content') as string || '',
        url: formData.get('url') as string || '',
        imageFile: formData.get('imageFile') as File || null
      };
    } else {
      // Handle JSON data
      requestBody = await req.json();
    }
    
    console.log('Request body received:', {
      hasContent: !!requestBody.content,
      hasUrl: !!requestBody.url,
      hasImageFile: !!requestBody.imageFile,
      contentLength: requestBody.content?.length || 0
    });
    
    const { content, url, imageFile }: VerificationRequest = requestBody;

    // Allow processing even without content if there's an image or URL
    if (!content && !url && !imageFile) {
      console.error('No content, URL, or image provided');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Por favor, forneça texto, URL ou imagem para verificar' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Starting news verification for:', content ? content.substring(0, 100) + '...' : 'URL/Image analysis');

    // Build comprehensive prompt for analysis based on available data
    let analysisContent = '';
    if (content && content.trim()) {
      analysisContent += `TEXTO/CONTEÚDO: ${content.trim()}`;
    }
    if (url && url.trim()) {
      analysisContent += `\nURL: ${url.trim()}`;
    }
    if (imageFile) {
      analysisContent += `\nIMAGEM: Análise de imagem fornecida pelo usuário`;
    }

    // If no meaningful content, provide fallback
    if (!analysisContent.trim()) {
      analysisContent = 'Conteúdo muito curto ou indefinido fornecido para análise';
    }

    const analysisPrompt = `
Você é um verificador de fatos profissional brasileiro. Analise a seguinte informação e forneça uma verificação completa:

INFORMAÇÃO A VERIFICAR:
${analysisContent}

INSTRUÇÕES IMPORTANTES:
1. Se o conteúdo for muito vago ou indefinido (como letras aleatórias), classifique como DUVIDOSA
2. Para URLs, analise o domínio e credibilidade da fonte
3. Para imagens, indique que análise visual não está totalmente disponível
4. Verifique credibilidade consultando fontes confiáveis brasileiras: G1, UOL, Folha, Estadão, BBC Brasil
5. Classifique como: VERDADEIRA (verified), FALSA (false) ou DUVIDOSA (partial)
6. Dê uma pontuação de 0-100 para veracidade
7. Forneça explicação detalhada e profissional em português
8. Liste critérios analisados
9. Identifique fontes relevantes

IMPORTANTE: Responda APENAS em JSON válido com esta estrutura exata:
{
  "classification": "verified|false|partial",
  "score": 50,
  "explanation": "Explicação detalhada profissional em português",
  "criteria": [
    {"name": "Clareza do conteúdo", "status": true},
    {"name": "Presença em fontes confiáveis", "status": false},
    {"name": "Consistência com dados oficiais", "status": false}
  ],
  "sources": [
    {"name": "G1", "url": "https://g1.globo.com", "verified": false},
    {"name": "UOL", "url": "https://uol.com.br", "verified": false}
  ]
}`;

    // Call Google Gemini API
    console.log('Calling Gemini API...');
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
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
          topK: 32,
          topP: 1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
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